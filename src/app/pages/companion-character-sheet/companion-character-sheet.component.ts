import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Character } from '../../model/character';
import { Skill } from '../../model/skill';
import { Spell } from '../../model/spell';
import { AppStorageService, DebouncedSaveHandle } from '../../services/app-storage.service';
import { downloadJson } from '../../services/character-format';
import { getAllCombatStyles } from '../../services/character-service.service';
import { HIT_LOCATIONS, HitLocation } from '../../services/hit-points';
import {
  CompanionCharacter, CharacteristicKey, AttributeKey,
  CHARACTERISTICS, FATIGUE, FATIGUE_RULES, SheetEffect, SheetModifier,
  companionState, currentCharacteristic, skillTotal, attributeTotal, damageModifier,
  magicPointMaximum, maxLocationHp, displayedLocationHp, initializePristineHitPoints, movementSummary,
  skillGroups, severity, fatigueRule, canAct, changeLocationHp, findTraditionSkill,
} from '../../services/companion-sheet';

type SheetTab = 'weapons'|'magic'|'armour'|'equipment'|'notes';
interface LocationDisplay {
  key: HitLocation; label:string; roll:string;
  path:string; centerX:number; centerY:number; labelX:number; labelY:number;
}
interface Tradition { title:string; subtitle:string; spells:{name:string;description?:string;tags?:string}[]; skills:string[]; }

const LOCATIONS:LocationDisplay[] = [
  {key:'head',label:'Голова',roll:'19–20',path:'M156 16 C145 16 137 27 139 44 C141 62 150 72 161 72 C173 72 183 59 182 44 C181 26 174 16 156 16Z',centerX:160,centerY:44,labelX:244,labelY:27},
  {key:'chest',label:'Грудь',roll:'10–12',path:'M136 82 Q158 74 186 82 L197 159 L126 159Z',centerX:161,centerY:118,labelX:244,labelY:107},
  {key:'abdoment',label:'Живот',roll:'7–9',path:'M126 165 L197 165 L189 210 L136 210Z',centerX:161,centerY:185,labelX:244,labelY:202},
  {key:'rightArm',label:'Правая рука',roll:'13–15',path:'M133 86 L118 92 L91 202 L105 207 L142 143Z',centerX:113,centerY:156,labelX:4,labelY:131},
  {key:'leftArm',label:'Левая рука',roll:'16–18',path:'M191 86 L205 92 L235 202 L221 207 L183 143Z',centerX:211,centerY:156,labelX:245,labelY:150},
  {key:'rightLeg',label:'Правая нога',roll:'1–3',path:'M136 216 L161 216 L158 362 L133 362 L128 307Z',centerX:148,centerY:292,labelX:4,labelY:311},
  {key:'leftLeg',label:'Левая нога',roll:'4–6',path:'M164 216 L189 216 L196 307 L190 362 L165 362Z',centerX:177,centerY:292,labelX:244,labelY:311},
];
const DIFFICULTIES = [
  {name:'Very Easy',multiplier:2},{name:'Easy',multiplier:1.5},
  {name:'Standard',multiplier:1},{name:'Hard',multiplier:2/3},
  {name:'Formidable',multiplier:.5},{name:'Herculean',multiplier:.1},
];
const ATT_KEYS: {key:AttributeKey; name:string}[] = [
  {key:'ap',name:'Action Points'}, {key:'healing',name:'Healing Rate'},
  {key:'init',name:'Initiative'}, {key:'luck',name:'Luck Points'},
  {key:'expMod',name:'Experience Modifier'}, {key:'damage',name:'Damage Modifier'},
  {key:'movement',name:'Movement'}, {key:'magicPoints',name:'Magic Points'},
];

@Component({
  selector:'app-companion-character-sheet',
  standalone:true,
  imports:[CommonModule,FormsModule,RouterModule],
  templateUrl:'./companion-character-sheet.component.html',
  styleUrls:['./companion-character-sheet.component.scss'],
})
export class CompanionCharacterSheetComponent implements OnInit, OnDestroy {
  readonly storage=inject(AppStorageService);
  private readonly router=inject(Router);
  private saveHandle?:DebouncedSaveHandle;
  character!:CompanionCharacter;
  readonly characteristics=CHARACTERISTICS;
  readonly fatigueLevels=FATIGUE;
  readonly fatigueRules=FATIGUE_RULES;
  fatigueTableOpen=false;
  readonly characteristicModifierOptions=CHARACTERISTICS.map(key=>({key,label:key.toUpperCase()}));
  readonly attributeModifierOptions=ATT_KEYS.map(x=>({key:x.key,label:x.name}));
  private skillModifierOptions:{key:string;label:string}[]=[];
  readonly locations=LOCATIONS;
  readonly difficulties=DIFFICULTIES;
  readonly tabs:{key:SheetTab;label:string}[]=[
    {key:'weapons',label:'Боевой стиль и оружие'},
    {key:'magic',label:'Магия'},
    {key:'armour',label:'Броня'},
    {key:'equipment',label:'Снаряжение'},
    {key:'notes',label:'Игровые заметки'},
  ];
  activeTab:SheetTab='weapons';
  query='';
  activeSkill:Skill|null=null;
  movementDialog=false;
  selectedLocation:HitLocation='chest';
  /** HP to deal or restore with a single click. The amount is shared by all locations. */
  hpAmount=1;
  openedWeapon=-1;
  openedSpell='';
  upgrade=false;
  draftStats:Partial<Record<CharacteristicKey,number>>={};
  readonly draftSkills=new Map<Skill,number>();
  addingEffect=false;
  effectName=''; effectDuration=''; effectDescription='';
  newModifiers:SheetModifier[]=[];
  editingEquipment=false;

  ngOnInit():void {
    this.character=this.storage.readCharacter('view-character') as CompanionCharacter;
    const hpInitialised=initializePristineHitPoints(this.character);
    const options=[...this.character.skills.skills,...(this.character.skills.specialized||[]),
      ...(this.character.skills.combatstyles||[]),
      ...(this.character.skills.extraProfessionalCultureSkills||[]),
      ...(this.character.skills.extraProfessionalCareerSkills||[]),
      ...(this.character.skills.hobby?[this.character.skills.hobby]:[])];
    // A persistent array prevents Angular recreating <option> elements and
    // resetting the native select to its first item on every change detection.
    this.skillModifierOptions=[...new Set(options.filter(Boolean).map(s=>s.name))].map(key=>({key,label:key}));
    this.saveHandle=this.storage.createDebouncedSave(()=>this.save(),350);
    if(hpInitialised)this.saveHandle.schedule();
  }
  ngOnDestroy():void {this.saveHandle?.flush();this.saveHandle?.destroy();}
  @HostListener('document:input') @HostListener('document:change') @HostListener('document:click')
  onEdit():void {this.saveHandle?.schedule();}
  @HostListener('window:beforeunload') @HostListener('window:pagehide')
  flush():void {this.saveHandle?.flush();}
  @HostListener('document:keydown.escape') onEscape():void {this.activeSkill=null;this.movementDialog=false;this.addingEffect=false;this.fatigueTableOpen=false;}
  save():void {if(this.character)this.storage.saveCharacter(this.character,'view-character');}
  editInBuilder():void {
    this.flush();if(this.storage.error)return;
    this.storage.setJson('creation-character',this.character);
    this.router.navigate(['/character-creation']);
  }
  exportJson():void {this.flush();downloadJson(this.character,(this.character.name||'character')+'.json');}

  get groups(){return skillGroups(this.character).map(g=>({...g,skills:g.skills.filter(s=>s.name.toLowerCase().includes(this.query.toLowerCase()))}));}
  get styles(){return getAllCombatStyles(this.character);}
  get visiblePassions(){return (this.character.passions||[]).filter(p=>Boolean(p?.passion?.trim()));}
  charValue(key:CharacteristicKey):number {return currentCharacteristic(this.character,key,this.upgrade?this.draftStats:{});}
  charBase(key:CharacteristicKey):number {return currentCharacteristic(this.character,key);}
  skillValue(skill:Skill):number {return skillTotal(this.character,skill,this.upgrade?this.draftStats:{},this.upgrade?(this.draftSkills.get(skill)||0):0);}
  oldSkillValue(skill:Skill):number {return skillTotal(this.character,skill);}
  indirectSkillDelta(skill:Skill):number {return this.skillValue(skill)-this.oldSkillValue(skill)-(this.draftSkills.get(skill)||0);}
  /** Use the very same Skill instance and difficulty modal as in the Skills column. */
  magicSkill(name:string):Skill|null {return findTraditionSkill(this.character,name);}
  relatedSkill(name:string):number|null {
    const skill=this.magicSkill(name);
    return skill?this.skillValue(skill):null;
  }
  openMagicSkill(name:string):void {this.activeSkill=this.magicSkill(name);}
  attr(key:'ap'|'healing'|'init'|'luck'|'expMod'):number {
    return attributeTotal(this.character,key,this.upgrade?this.draftStats:{});
  }
  attrOld(key:'ap'|'healing'|'init'|'luck'|'expMod'):number {
    return attributeTotal(this.character,key);
  }
  get damage():string {return damageModifier(this.character,this.upgrade?this.draftStats:{});}
  get move(){return movementSummary(this.character);}
  get mpMax():number {return magicPointMaximum(this.character,this.upgrade?this.draftStats:{});}
  get currentMovement():number {return this.move.walking;}
  get fatigueInitiativePenalty():number|null {return this.currentFatigueRule.initiative;}
  get fatigueActionPointsPenalty():number|null {return this.currentFatigueRule.actionPoints;}
  get armourPenalty():number {return this.move.armourPenalty;}
  currentResource(key:'ap'|'luck'|'magicPoints',max:number):number {
    const value=this.character.currentValues?.[key];
    return value!==''&&value!=null&&Number.isFinite(Number(value))?Math.max(0,Math.min(max,Number(value))):max;
  }
  adjustResource(key:'ap'|'luck'|'magicPoints',delta:number,max:number):void {
    const next=Math.max(0,Math.min(max,this.currentResource(key,max)+delta));
    (this.character.currentValues ||= {})[key]=next;
  }
  get effects():SheetEffect[] {return this.character.companion?.effects||[];}
  /** Previously saved gifts remain visible; new narrative effects use the regular effect editor. */
  get gifts(){return this.character.companion?.gifts||[];}
  removeEffect(id:string):void {companionState(this.character).effects=this.effects.filter(x=>x.id!==id);}
  addModifier():void {this.newModifiers.push({kind:'characteristic',key:'str',amount:1});}
  modifierOptions(kind:SheetModifier['kind']):{key:string;label:string}[] {
    if(kind==='characteristic')return this.characteristicModifierOptions;
    if(kind==='attribute')return this.attributeModifierOptions;
    return this.skillModifierOptions;
  }
  trackModifierOption(_index:number,option:{key:string}):string{return option.key;}
  setModifierKind(mod:SheetModifier,kind:SheetModifier['kind']):void {
    mod.kind=kind;mod.key=this.modifierOptions(kind)[0]?.key||'';
  }
  setModifierKey(mod:SheetModifier,key:string):void {mod.key=key;}
  applyEffect():void {
    if(!this.effectName.trim())return;
    const effect:SheetEffect={id:Date.now().toString(),name:this.effectName.trim(),
      duration:this.effectDuration.trim(),description:this.effectDescription.trim(),
      modifiers:this.newModifiers.map(x=>({...x,amount:Number(x.amount)||0}))};
    companionState(this.character).effects=[...this.effects,effect];
    this.cancelEffect();
  }
  cancelEffect():void {this.addingEffect=false;this.effectName='';this.effectDuration='';this.effectDescription='';this.newModifiers=[];}
  setFatigue(value:string):void {this.character.fatigueLevel=value;}
  get currentFatigueRule(){return fatigueRule(this.character);}
  get canAct():boolean{return canAct(this.character);}
  get currentHp():number {return displayedLocationHp(this.character,this.selectedLocation,this.upgrade?this.draftStats:{});}
  maxHp(key:HitLocation):number {return maxLocationHp(this.character,key,this.upgrade?this.draftStats:{});}
  hp(key:HitLocation):number {return displayedLocationHp(this.character,key,this.upgrade?this.draftStats:{});}
  hpColour(key:HitLocation):string {
    const max=this.maxHp(key),n=this.hp(key);const wound=severity(n,max);
    if(wound==='major')return '#864b60';if(wound==='serious')return '#d07d76';
    const t=Math.max(0,Math.min(1,n/max));
    return 'rgb('+[0,1,2].map(i=>Math.round([235,179,99][i]*(1-t)+[150,200,155][i]*t)).join(',')+')';
  }
  injuryMark(key:HitLocation):boolean {
    return this.hp(key)<=0;
  }
  /** Reject blank, fractional or otherwise invalid amounts rather than dealing accidental damage. */
  get hpAmountValid():boolean {
    return Number.isSafeInteger(this.hpAmount) && this.hpAmount>=1 && this.hpAmount<=999;
  }
  adjustSelectedHp(direction:-1|1):void {
    if(!this.hpAmountValid)return;
    changeLocationHp(this.character,this.selectedLocation,direction*this.hpAmount);
  }
  ap(loc:HitLocation):number|string {return this.character.equipment[loc]?.ap??0;}
  get injury():string {return this.character.companion?.injuries?.[this.selectedLocation]||'';}
  set injury(value:string){companionState(this.character).injuries={...this.character.companion?.injuries,[this.selectedLocation]:value};}
  onSvgKey(event:KeyboardEvent,loc:HitLocation):void {if(event.key==='Enter'||event.key===' '){event.preventDefault();this.selectedLocation=loc;}}

  get allWeaponRows(){return this.character.equipment.weapons||[];}
  weaponDamage(w:any):string {return [w.damage,w.oneHanded,w.twoHanded,w.shield,w.unarmed,w.ranged].filter(Boolean).join(' / ')||'—';}
  weaponType(w:any):string {return w.ranged?'Дальнее':w.shield?'Щит':'Ближнее';}
  get traditions():Tradition[] {
    const m=this.character.magic;
    const ret:Tradition[]=[];
    const add=(title:string,subtitle:string,spells:any[],skills:string[])=>{
      if(!spells?.length)return;
      ret.push({title,subtitle,spells:spells.map(x=>typeof x==='string'?{name:x,description:''}:{name:x.name||'Без названия',description:x.description||'',tags:x.tags||''}),skills});
    };
    add('Theism',this.character.theistCult?.name||'Чудеса',m.miracles,['Devotion','Exhort']);
    add('Folk Magic','Народная магия',m.folk,['Folk Magic']);
    add('Sorcery',this.character.sorceryOrder?.name||'Колдовство',m.sorcery,['Invocation','Shaping']);
    add('Mysticism · Augmentations',this.character.mysticalOrder?.name||'',m.path?.augmentations||[],['Meditation','Mysticism']);
    add('Mysticism · Invocations',this.character.mysticalOrder?.name||'',m.path?.invocations||[],['Meditation','Mysticism']);
    add('Mysticism · Enhancements',this.character.mysticalOrder?.name||'',m.path?.enhancements||[],['Meditation','Mysticism']);
    add('Other magic','Дополнительная магия',m.custom||[],[]);
    if(m.spirits)ret.push({title:'Animism',subtitle:'Духи',spells:[{name:'Духи',description:m.spirits}],skills:['Trance','Binding']});
    return ret;
  }
  get equipmentSlots(){return LOCATIONS;}
  get equipmentNotes():string {return this.character.companion?.equipmentNotes||'';}
  set equipmentNotes(text:string){companionState(this.character).equipmentNotes=text;}
  get sessionNotes():string {return this.character.sessionNotes||'';}
  set sessionNotes(text:string){this.character.sessionNotes=text;}

  beginUpgrade():void {this.upgrade=true;this.draftStats={};this.draftSkills.clear();}
  discardUpgrade():void {this.upgrade=false;this.draftStats={};this.draftSkills.clear();}
  get hasUpgrade(){return Object.values(this.draftStats).some(v=>v!==0)||[...this.draftSkills.values()].some(x=>x!==0);}
  alterStat(key:CharacteristicKey,delta:number):void {
    const next=(this.draftStats[key]||0)+delta;
    if(this.charBase(key)+next<1)return;
    this.draftStats[key]=next;
  }
  alterSkill(skill:Skill,delta:number):void {this.draftSkills.set(skill,(this.draftSkills.get(skill)||0)+delta);}
  applyUpgrade():void {
    // Permanent advancements are saved into native Mythras Tools properties.
    for(const key of CHARACTERISTICS){
      const delta=this.draftStats[key]||0;
      this.character.skills[key]+=delta;
      const manual=this.character.currentValues?.[key];
      if(delta && manual!=='' && manual!==undefined && manual!==null && Number.isFinite(Number(manual))){
        (this.character.currentValues ||= {})[key]=Number(manual)+delta;
      }
    }
    for(const [skill,delta] of this.draftSkills)skill.extraBonus=(Number(skill.extraBonus)||0)+delta;
    this.discardUpgrade();
  }
  difficultyTarget(multiplier:number):number {return this.activeSkill?Math.ceil(this.skillValue(this.activeSkill)*multiplier):0;}
  stopOverlay(event:MouseEvent):void {if(event.target===event.currentTarget){this.activeSkill=null;this.movementDialog=false;this.fatigueTableOpen=false;}}
  trackSkill(_index:number,s:Skill):Skill{return s;}
  trackLocation(_index:number,loc:LocationDisplay):HitLocation{return loc.key;}
}
