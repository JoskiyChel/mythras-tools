import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Character } from '../../model/character';
import { Skill } from '../../model/skill';
import { CombatStyle } from '../../model/combat-style';
import { CharacterWeapon } from '../../model/character-weapon';
import { SpecialEffectsService } from '../../services/special-effects.service';
import { BuilderSection } from '../../services/builder-navigation';
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
  skillGroups, severity, fatigueRule, canAct, changeLocationHp, findTraditionSkill, shapingPointMaximum,
} from '../../services/companion-sheet';

interface SheetInfo { title:string; source?:string; sections:{label:string;paragraphs:string[]}[]; }

type SheetTab = 'weapons'|'magic'|'armour'|'equipment'|'notes';
interface LocationDisplay {
  key: HitLocation; label:string; roll:string;
  path:string; centerX:number; centerY:number; labelX:number; labelY:number;
}
interface Tradition { title:string; subtitle:string; spells:{name:string;description?:string;tags?:string}[]; skills:string[]; }

// A seven-part relief inspired by a Greek kouros. Anatomical right is on the viewer's left.
const LOCATIONS:LocationDisplay[] = [
  {key:'head',label:'Голова',roll:'19–20',path:'M233 39 C234 18 247 12 260 12 C277 12 289 23 288 43 L285 62 Q282 76 269 82 L269 96 L251 96 L251 82 Q237 76 235 62Z',centerX:314,centerY:82,labelX:373,labelY:42},
  {key:'chest',label:'Грудь',roll:'10–12',path:'M248 96 Q234 100 218 107 Q212 130 222 159 L230 200 Q260 208 290 200 L298 159 Q308 130 302 107 Q285 100 272 96 Q260 103 248 96Z',centerX:260,centerY:160,labelX:373,labelY:135},
  {key:'abdoment',label:'Живот',roll:'7–9',path:'M230 204 Q260 212 290 204 L296 266 Q282 278 260 291 Q238 278 224 266Z',centerX:260,centerY:246,labelX:373,labelY:280},
  {key:'rightArm',label:'Правая рука',roll:'13–15',path:'M214 108 Q201 105 192 119 Q182 136 181 159 L167 213 Q155 239 150 274 L144 297 Q141 309 148 319 Q156 325 163 316 L171 295 Q180 274 183 255 L197 225 Q206 204 209 184 L221 147 Q216 128 214 108Z',centerX:178,centerY:211,labelX:10,labelY:177},
  {key:'leftArm',label:'Левая рука',roll:'16–18',path:'M306 108 Q319 105 328 119 Q338 136 339 159 L353 213 Q365 239 370 274 L376 297 Q379 309 372 319 Q364 325 357 316 L349 295 Q340 274 337 255 L323 225 Q314 204 311 184 L299 147 Q304 128 306 108Z',centerX:342,centerY:211,labelX:373,labelY:204},
  {key:'rightLeg',label:'Правая нога',roll:'1–3',path:'M224 271 L257 295 Q252 326 251 353 L247 389 Q249 417 240 454 L237 507 Q241 519 236 530 L206 535 Q198 533 203 524 L216 505 L214 455 Q211 424 219 392 L216 347 Q210 308 224 271Z',centerX:229,centerY:391,labelX:10,labelY:398},
  {key:'leftLeg',label:'Левая нога',roll:'4–6',path:'M296 271 L263 295 Q268 326 269 353 L273 389 Q271 417 280 454 L283 507 Q279 519 284 530 L314 535 Q322 533 317 524 L304 505 L306 455 Q309 424 301 392 L304 347 Q310 308 296 271Z',centerX:291,centerY:391,labelX:373,labelY:398},
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
  imports:[CommonModule,FormsModule,RouterModule,A11yModule],
  templateUrl:'./companion-character-sheet.component.html',
  styleUrls:['./companion-character-sheet.component.scss'],
})
export class CompanionCharacterSheetComponent implements OnInit, OnDestroy {
  readonly storage=inject(AppStorageService);
  private readonly router=inject(Router);
  private readonly specialEffects=inject(SpecialEffectsService);
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
  activeInfo:SheetInfo|null=null;
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
  @HostListener('document:keydown.escape') onEscape():void {this.activeSkill=null;this.activeInfo=null;this.movementDialog=false;this.addingEffect=false;this.fatigueTableOpen=false;}
  save():void {if(this.character)this.storage.saveCharacter(this.character,'view-character');}
  editInBuilder(section?:BuilderSection,focus?:string):void {
    this.flush();if(this.storage.error)return;
    this.storage.setJson('creation-character',this.character);
    if(this.storage.error)return;
    this.router.navigate(['/character-creation'],section?{queryParams:{section,...(focus?{focus}:{})}}:{});
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
  get move(){
    const bonus=(name:string)=>this.upgrade?(this.draftSkills.get(this.character.skills.skills.find(s=>s.name===name)!)||0):0;
    return movementSummary(this.character,this.upgrade?this.draftStats:{},{athletics:bonus('Athletics'),swim:bonus('Swim')});
  }
  get shapingPoints():number {return shapingPointMaximum(this.relatedSkill('Shaping')||0);}
  get devotionMaximum():number {return Math.max(0,Number(this.character.devotionPool)||0);}
  get devotionCurrent():number {
    const value=this.character.devotionPoolCurrent;
    return value==null||String(value)===''?this.devotionMaximum:Math.max(0,Math.min(this.devotionMaximum,Number(value)||0));
  }
  setDevotionMaximum(value:number|null):void {
    if(value==null){delete (this.character as Partial<Character>).devotionPool;return;}
    this.character.devotionPool=Math.max(0,Math.floor(value));
    if(this.character.devotionPoolCurrent!=null && Number(this.character.devotionPoolCurrent)>this.devotionMaximum){
      this.character.devotionPoolCurrent=this.devotionMaximum;
    }
  }
  setDevotionCurrent(value:number|null):void {
    if(value==null){delete (this.character as Partial<Character>).devotionPoolCurrent;return;}
    this.character.devotionPoolCurrent=Math.max(0,Math.min(this.devotionMaximum,Math.floor(value)));
  }
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
    if(wound==='major')return '#9c5e61';if(wound==='serious')return '#d18a70';
    const t=Math.max(0,Math.min(1,n/max));
    return 'rgb('+[0,1,2].map(i=>Math.round([211,172,104][i]*(1-t)+[235,223,197][i]*t)).join(',')+')';
  }
  injuryMark(key:HitLocation):boolean {
    return this.hp(key)<=0 || Boolean(this.character.companion?.injuries?.[key]);
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

  get allWeaponRows():Partial<CharacterWeapon>[]{return this.character.equipment.weapons||[];}
  weaponDamage(w:any):string {if(w.damage)return String(w.damage);return [w.oneHanded,w.twoHanded,w.shield,w.unarmed,w.ranged].filter(Boolean).join(' / ')||'—';}
  weaponType(w:any):string {return w.ranged?'Дальнее':w.shield?'Щит':'Ближнее';}
  get traditions():Tradition[] {
    const m=this.character.magic;
    const ret:Tradition[]=[];
    const add=(title:string,subtitle:string,spells:any[],skills:string[],showEmpty=false)=>{
      if(!spells?.length&&!showEmpty)return;
      ret.push({title,subtitle,spells:spells.map(x=>typeof x==='string'?{name:x,description:''}:{name:x.name||'Без названия',description:x.description||'',tags:x.tags||''}),skills});
    };
    add('Theism',this.character.theistCult?.name||'Чудеса',m.miracles,['Devotion','Exhort'],this.character.devotionPool!=null||this.character.devotionPoolCurrent!=null||!!this.character.theistCult?.name||(this.relatedSkill('Devotion')||0)>0||(this.relatedSkill('Exhort')||0)>0);
    add('Folk Magic','Народная магия',m.folk,['Folk Magic']);
    add('Sorcery',this.character.sorceryOrder?.name||'Колдовство',m.sorcery,['Invocation','Shaping'],!!this.character.sorceryOrder?.name||(this.relatedSkill('Invocation')||0)>0||(this.relatedSkill('Shaping')||0)>0);
    add('Mysticism · Augmentations',this.character.mysticalOrder?.name||'',m.path?.augmentations||[],['Meditation','Mysticism']);
    add('Mysticism · Invocations',this.character.mysticalOrder?.name||'',m.path?.invocations||[],['Meditation','Mysticism']);
    add('Mysticism · Enhancements',this.character.mysticalOrder?.name||'',m.path?.enhancements||[],['Meditation','Mysticism']);
    add('Other magic','Дополнительная магия',m.custom||[],[]);
    if(m.spirits)ret.push({title:'Animism',subtitle:'Духи',spells:[{name:'Духи',description:m.spirits}],skills:['Trance','Binding']});
    return ret;
  }

  styleWeapons(style:CombatStyle):{kind:string;text:string}[] {
    return Object.entries(style.weapons||{}).filter(([,value])=>!!value).map(([kind,value])=>({kind,text:String(value)}));
  }
  openStyleDescription(style:CombatStyle):void {
    const detail=style as CombatStyle & {description?:string};
    const sections:SheetInfo['sections']=[];
    const add=(label:string,text:string|undefined)=>{if(text)sections.push({label,paragraphs:[text]});};
    add('Описание',detail.description);add('Культура',style.culture);add('Происхождение',style.background);
    add('Особенности кампании',style.campaignSpecific||(style as any)['campaign-specific']);
    const weapons=this.styleWeapons(style).map(w=>w.kind+': '+w.text);
    if(weapons.length)sections.push({label:'Доступное оружие',paragraphs:weapons});
    if(style.selectedTrait)add('Выбранная черта: '+style.selectedTrait.name,style.selectedTrait.trait||(style.selectedTrait as any).description);
    if(style.traits?.length)sections.push({label:'Черты стиля',paragraphs:style.traits.map(t=>t.name+': '+(t.trait||(t as any).description||'Описание не задано'))});
    add('Наступательные эффекты',style.offensive);add('Защитные эффекты',style.defensive);
    add('Критические наступательные эффекты',style.critOffensive||(style as any)['crit-offensive']);
    add('Критические защитные эффекты',style.critDefensive||(style as any)['crit-defensive']);
    if(!sections.length)add('Описание','Дополнительное описание этого стиля не задано.');
    this.activeInfo={title:style.name,source:style.source,sections};
  }
  openStyleTrait(style:CombatStyle):void {
    const trait=style.selectedTrait;if(!trait)return;
    this.activeInfo={title:trait.name,source:style.source,sections:[{label:'Черта боевого стиля '+style.name,
      paragraphs:[trait.trait||(trait as any).description||'Описание черты не задано.']}]};
  }
  weaponEffectNames(weapon:any,kind:'offensive'|'defensive'):string[] {
    const raw=kind==='offensive'?weapon.offensiveSkills:weapon.defensiveSkills;
    return [...new Set(String(raw||'').split(',').map(s=>s.trim()).filter(Boolean))];
  }
  openWeaponEffect(name:string,weapon:any):void {
    const effect=this.specialEffects.getSpecialEffect(name);
    const custom=(weapon.traits||[]).find((t:any)=>String(t.name).toLowerCase()===name.toLowerCase());
    this.activeInfo={title:name,source:effect?'Mythras Core Rules · Special Effects':weapon.name,
      sections:[...(effect?.requirement?[{label:'Условия',paragraphs:[effect.requirement]}]:[]),
        {label:'Действие эффекта',paragraphs:effect?.traits||[custom?.description||'Описание отсутствует в сохранении и справочнике. Уточните правила эффекта у ведущего.']}]};
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
      if(!delta)continue;
      this.character.skills[key]=(Number(this.character.skills[key])||0)+delta;
      const manual=this.character.currentValues?.[key];
      if(delta && manual!=='' && manual!==undefined && manual!==null && Number.isFinite(Number(manual))){
        (this.character.currentValues ||= {})[key]=Number(manual)+delta;
      }
    }
    for(const [skill,delta] of this.draftSkills)skill.extraBonus=(Number(skill.extraBonus)||0)+delta;
    this.discardUpgrade();
  }
  difficultyTarget(multiplier:number):number {return this.activeSkill?Math.ceil(this.skillValue(this.activeSkill)*multiplier):0;}
  stopOverlay(event:MouseEvent):void {if(event.target===event.currentTarget){this.activeSkill=null;this.activeInfo=null;this.movementDialog=false;this.fatigueTableOpen=false;}}
  // Getters return fresh grouping objects; stable keys retain the triggering
  // buttons so dialog focus restoration and keyboard navigation can work.
  trackGroup(_index:number,group:{name:string}):string{return group.name;}
  trackTradition(_index:number,tradition:Tradition):string{return tradition.title;}
  trackSpell(index:number,spell:{name:string}):string{return index+':'+spell.name;}
  trackSkill(_index:number,s:Skill):Skill{return s;}
  trackLocation(_index:number,loc:LocationDisplay):HitLocation{return loc.key;}
}
