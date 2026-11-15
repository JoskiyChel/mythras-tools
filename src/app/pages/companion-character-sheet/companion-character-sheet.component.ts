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
import { HIT_LOCATION_RULES, HitLocation, hitLocationRule } from '../../services/hit-locations';
import {
  CompanionCharacter, CharacteristicKey, AttributeKey,
  CHARACTERISTICS, FATIGUE, FATIGUE_RULES, SheetEffect, SheetModifier, MagicStatKey,
  companionState, currentCharacteristic, skillTotal, attributeTotal, damageModifier,
  magicPointMaximum, maxLocationHp, displayedLocationHp, initializePristineHitPoints, movementSummary,
  skillGroups, severity, fatigueRule, canAct, changeLocationHp, findTraditionSkill, shapingPointMaximum,
  DIFFICULTY_STEPS, DifficultyStep, CheckThresholds, checkThresholds, augmentingBonus,
  WOUND_TYPES, locationInjuries, setLocationInjuries, magicModifier,
  theismPoolLimit, theismIntensity, animismMaxSpiritPow, animismSpiritLimit,
  animismSpiritDamage, mysticismTotalIntensity, mysticismTalentIntensity, mysticismTrainedLimit,
  sorceryIntensity, sorceryMemoryLimit, folkMagicStartingSpells,
} from '../../services/companion-sheet';

interface SheetInfo { title:string; source?:string; sections:{label:string;paragraphs:string[]}[]; }

type SheetTab = 'weapons'|'magic'|'armour'|'equipment'|'notes';
interface LocationGeometry { path:string; centerX:number; centerY:number; labelX:number; labelY:number; }
interface LocationDisplay extends LocationGeometry {
  key: HitLocation; label:string; roll:string;
}
interface Tradition { title:string; subtitle:string; spells:{name:string;description?:string;tags?:string}[]; skills:string[]; }

/** Drawing only: labels, order and d20 ranges come from services/hit-locations.ts.
 * Anatomical right is on the viewer's left. */
const LOCATION_GEOMETRY: Record<HitLocation, LocationGeometry> = {
  head: {path:'M233 39 C234 18 247 12 260 12 C277 12 289 23 288 43 L285 62 Q282 76 269 82 L269 96 L251 96 L251 82 Q237 76 235 62Z', centerX:314, centerY:82, labelX:373, labelY:42},
  chest: {path:'M248 96 Q234 100 218 107 Q212 130 222 159 L230 200 Q260 208 290 200 L298 159 Q308 130 302 107 Q285 100 272 96 Q260 103 248 96Z', centerX:260, centerY:160, labelX:373, labelY:135},
  abdoment: {path:'M230 204 Q260 212 290 204 L296 266 Q282 278 260 291 Q238 278 224 266Z', centerX:260, centerY:246, labelX:373, labelY:280},
  rightArm: {path:'M214 108 Q201 105 192 119 Q182 136 181 159 L167 213 Q155 239 150 274 L144 297 Q141 309 148 319 Q156 325 163 316 L171 295 Q180 274 183 255 L197 225 Q206 204 209 184 L221 147 Q216 128 214 108Z', centerX:178, centerY:211, labelX:10, labelY:177},
  leftArm: {path:'M306 108 Q319 105 328 119 Q338 136 339 159 L353 213 Q365 239 370 274 L376 297 Q379 309 372 319 Q364 325 357 316 L349 295 Q340 274 337 255 L323 225 Q314 204 311 184 L299 147 Q304 128 306 108Z', centerX:342, centerY:211, labelX:373, labelY:204},
  rightLeg: {path:'M224 271 L257 295 Q252 326 251 353 L247 389 Q249 417 240 454 L237 507 Q241 519 236 530 L206 535 Q198 533 203 524 L216 505 L214 455 Q211 424 219 392 L216 347 Q210 308 224 271Z', centerX:229, centerY:391, labelX:10, labelY:398},
  leftLeg: {path:'M296 271 L263 295 Q268 326 269 353 L273 389 Q271 417 280 454 L283 507 Q279 519 284 530 L314 535 Q322 533 317 524 L304 505 L306 455 Q309 424 301 392 L304 347 Q310 308 296 271Z', centerX:291, centerY:391, labelX:373, labelY:398},
};
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
  private skillModifierOptions:{key:string;label:string;skillId?:string}[]=[];
  /** ТЗ §5 (решение из design/COMPANION-OPEN-QUESTIONS.md): one magic kind with named stats. */
  readonly magicModifierOptions:{key:MagicStatKey;label:string}[]=[
    {key:'theism.poolMax',label:'Theism · максимум Devotion Pool'},
    {key:'theism.intensity',label:'Theism · Intensity / Magnitude'},
    {key:'animism.maxSpiritPOW',label:'Animism · максимальный POW духа'},
    {key:'mysticism.totalIntensity',label:'Mysticism · суммарная Intensity'},
    {key:'sorcery.shapingPoints',label:'Sorcery · очки формирования'},
  ];
  readonly locations:LocationDisplay[] = HIT_LOCATION_RULES.map(rule => ({
    key:rule.key, label:rule.labelRu, roll:rule.roll, ...LOCATION_GEOMETRY[rule.key],
  }));
  readonly difficulties=DIFFICULTY_STEPS;
  readonly woundTypes=WOUND_TYPES;
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
  /** One augmenting skill at a time; it affects the current check only. */
  augmentSkill:Skill|null=null;
  augmentQuery='';
  /** Mobile: the skills panel is a drawer, closed by default. */
  skillsOpen=false;
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
    const counts=new Map<string,number>();
    options.filter(Boolean).forEach(skill=>counts.set(skill.name,(counts.get(skill.name)||0)+1));
    const seen=new Set<string>();
    this.skillModifierOptions=options.filter(Boolean)
      .filter(skill=>{
        const key=(skill.name||'')+'|'+(skill.id||'');
        if(seen.has(key))return false;
        seen.add(key);
        return true;
      })
      .map(skill=>{
        // Duplicate names need a stable id so an effect can address one entry (R2).
        if((counts.get(skill.name)||0)>1&&skill.id){
          return {key:skill.id,label:`${skill.name} · ${skillTotal(this.character,skill)}%`,skillId:skill.id};
        }
        return {key:skill.name,label:skill.name};
      });
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
  openMagicSkill(name:string):void {this.openSkill(this.magicSkill(name));}
  /** A check starts without an augmenting skill: the choice lives only for the
   * current check and never changes the saved skill (ТЗ §6.2). */
  openSkill(skill:Skill|null):void {
    this.activeSkill=skill;
    this.augmentSkill=null;
    this.augmentQuery='';
    if(skill)this.skillsOpen=false;
  }
  /** Search over the same catalog the skills column shows, including custom and
   * specialized entries. Semantic suitability is the player's decision. */
  get augmentCandidates():Skill[] {
    const query=this.augmentQuery.trim().toLowerCase();
    if(!query||!this.activeSkill)return [];
    const active=this.activeSkill;
    const all=[...this.character.skills.skills,...(this.character.skills.specialized||[]),
      ...(this.character.skills.combatstyles||[]),...(this.character.skills.extraProfessionalCultureSkills||[]),
      ...(this.character.skills.extraProfessionalCareerSkills||[]),
      ...(this.character.skills.hobby?[this.character.skills.hobby]:[])];
    const unique=all.filter((skill,index)=>Boolean(skill)&&all.indexOf(skill)===index);
    return unique
      .filter(skill=>skill!==active&&skill.name.toLowerCase().includes(query)&&this.skillValue(skill)>0)
      .slice(0,12);
  }
  get augmentValue():number {return this.augmentSkill?this.skillValue(this.augmentSkill):0;}
  get augmentBonus():number {return augmentingBonus(this.augmentValue);}
  chooseAugment(skill:Skill):void {if(skill===this.activeSkill)return;this.augmentSkill=skill;this.augmentQuery='';}
  clearAugment():void {this.augmentSkill=null;this.augmentQuery='';}
  thresholds(step:DifficultyStep):CheckThresholds {
    return checkThresholds(this.activeSkill?this.skillValue(this.activeSkill):0,step,this.augmentValue);
  }
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
  get shapingPoints():number {
    return Math.max(0, shapingPointMaximum(this.relatedSkill('Shaping')||0) + magicModifier(this.character,'sorcery.shapingPoints'));
  }
  get powValue():number {return this.charValue('pow');}
  get chaValue():number {return this.charValue('cha');}
  get intValue():number {return this.charValue('int');}
  /** ТЗ §8.2: capacity from the rank stored in the existing cult record. */
  get devotionCapacity():number {return theismPoolLimit(this.character.theistCult?.level||'', this.powValue);}
  /** A number saved before the rank formulas existed stays a manual override. */
  get devotionManual():number|null {
    const raw=this.character.devotionPool;
    if(raw==null||String(raw)===''||!Number.isFinite(Number(raw)))return null;
    return Math.max(0,Number(raw));
  }
  get devotionIsManual():boolean {return this.devotionManual!==null;}
  get devotionMaximum():number {
    const base=this.devotionManual ?? this.devotionCapacity;
    return Math.max(0, base + magicModifier(this.character,'theism.poolMax'));
  }
  get devotionCurrent():number {
    const value=this.character.devotionPoolCurrent;
    return value==null||String(value)===''?this.devotionMaximum:Math.max(0,Math.min(this.devotionMaximum,Number(value)||0));
  }
  setDevotionMaximum(value:number|null):void {
    if(value==null){delete (this.character as Partial<Character>).devotionPool;return;}
    this.character.devotionPool=Math.max(0,Math.floor(value));
    this.clampDevotionCurrent();
  }
  /** Back to the rank formula; removes the manual override from the save. */
  resetDevotionToRank():void {
    delete (this.character as Partial<Character>).devotionPool;
    this.clampDevotionCurrent();
  }
  setDevotionCurrent(value:number|null):void {
    if(value==null){delete (this.character as Partial<Character>).devotionPoolCurrent;return;}
    this.character.devotionPoolCurrent=Math.max(0,Math.min(this.devotionMaximum,Math.floor(value)));
  }
  private clampDevotionCurrent():void {
    if(this.character.devotionPoolCurrent!=null && Number(this.character.devotionPoolCurrent)>this.devotionMaximum){
      this.character.devotionPoolCurrent=this.devotionMaximum;
    }
  }
  /** ТЗ §8.3, §9.5. */
  get devotionValue():number {return this.relatedSkill('Devotion')||0;}
  get exhortValue():number {return this.relatedSkill('Exhort')||0;}
  get theismIntensityValue():number {
    return Math.max(0, theismIntensity(this.devotionValue) + magicModifier(this.character,'theism.intensity'));
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
    if(this.upgrade)return; // Preview only: see adjustSelectedHp.
    const next=Math.max(0,Math.min(max,this.currentResource(key,max)+delta));
    (this.character.currentValues ||= {})[key]=next;
  }
  get effects():SheetEffect[] {return this.character.companion?.effects||[];}
  /** Previously saved gifts remain visible; new narrative effects use the regular effect editor. */
  get gifts(){return this.character.companion?.gifts||[];}
  removeEffect(id:string):void {companionState(this.character).effects=this.effects.filter(x=>x.id!==id);}
  addModifier():void {this.newModifiers.push({kind:'characteristic',key:'str',amount:1});}
  modifierOptions(kind:SheetModifier['kind']):{key:string;label:string;skillId?:string}[] {
    if(kind==='characteristic')return this.characteristicModifierOptions;
    if(kind==='attribute')return this.attributeModifierOptions;
    if(kind==='magic')return this.magicModifierOptions;
    return this.skillModifierOptions;
  }
  trackModifierOption(_index:number,option:{key:string}):string{return option.key;}
  setModifierKind(mod:SheetModifier,kind:SheetModifier['kind']):void {
    mod.kind=kind;mod.key=this.modifierOptions(kind)[0]?.key||'';delete mod.skillId;
  }
  setModifierKey(mod:SheetModifier,key:string):void {
    mod.key=key;
    const option=this.modifierOptions(mod.kind).find(entry=>entry.key===key);
    if(option?.skillId)mod.skillId=option.skillId;else delete mod.skillId;
  }
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
  /** Distinct glyphs per wound type: a severed, crushed and impaled location look
   * different and are never derived from lost HP (ТЗ §5.4). */
  readonly injuryGlyphs:{type:string;path:string;label:string}[]=[
    {type:'Отсечена',path:'M0 0 L8 10 M4 0 L12 10',label:'отсечение'},
    {type:'Раздроблена',path:'M5 0 L6.5 3.5 L10 5 L6.5 6.5 L5 10 L3.5 6.5 L0 5 L3.5 3.5 Z',label:'дробление'},
    {type:'Пронзена',path:'M0 5 L11 5 M7.5 1.5 L11 5 L7.5 8.5',label:'пронзение'},
  ];
  injuryMark(key:HitLocation):boolean {
    return locationInjuries(this.character,key).length>0;
  }
  injuryGlyphsFor(key:HitLocation):{type:string;path:string;label:string}[] {
    return locationInjuries(this.character,key)
      .map(type=>this.injuryGlyphs.find(glyph=>glyph.type===type))
      .filter((glyph):glyph is {type:string;path:string;label:string}=>Boolean(glyph));
  }
  injuryText(key:HitLocation):string {return locationInjuries(this.character,key).join(', ');}
  hasInjury(type:string):boolean {return locationInjuries(this.character,this.selectedLocation).includes(type);}
  toggleInjury(type:string):void {
    const current=locationInjuries(this.character,this.selectedLocation);
    setLocationInjuries(this.character,this.selectedLocation,
      current.includes(type)?current.filter(value=>value!==type):[...current,type]);
  }
  get selectedLabel():string {return hitLocationRule(this.selectedLocation).labelRu;}
  selectLocation(key:HitLocation):void {this.selectedLocation=key;}
  /** Reject blank, fractional or otherwise invalid amounts rather than dealing accidental damage. */
  get hpAmountValid():boolean {
    return Number.isSafeInteger(this.hpAmount) && this.hpAmount>=1 && this.hpAmount<=999;
  }
  /** Game state changes are blocked while advancement is only a preview, so a
   * draft does not silently change saved HP or resources (R6). */
  adjustSelectedHp(direction:-1|1):void {
    if(!this.hpAmountValid||this.upgrade)return;
    changeLocationHp(this.character,this.selectedLocation,direction*this.hpAmount);
  }
  ap(loc:HitLocation):number|string {return this.character.equipment[loc]?.ap??0;}
  onSvgKey(event:KeyboardEvent,loc:HitLocation):void {if(event.key==='Enter'||event.key===' '){event.preventDefault();this.selectLocation(loc);}}

  get allWeaponRows():Partial<CharacterWeapon>[]{return this.character.equipment.weapons||[];}
  weaponDamage(w:any):string {if(w.damage)return String(w.damage);return [w.oneHanded,w.twoHanded,w.shield,w.unarmed,w.ranged].filter(Boolean).join(' / ')||'—';}
  weaponType(w:any):string {return w.ranged?'Дальнее':w.shield?'Щит':'Ближнее';}
  /* Magic discipline parameters (ТЗ §9). Everything is computed from the skills
     and cult records that already exist in the save; no new fields are written. */
  get folkMagic():{value:number;known:number;starting:number} {
    const value=this.relatedSkill('Folk Magic')||0;
    return {value, known:(this.character.magic?.folk||[]).length, starting:folkMagicStartingSpells(value)};
  }
  get animism():{trance:number;binding:number;radius:number;maxSpiritPow:number;limit:number|null;damage:string|null;rank:string} {
    const binding=this.relatedSkill('Binding')||0;
    const rank=this.character.animistCult?.level||'';
    return {
      trance:this.relatedSkill('Trance')||0, binding, radius:this.powValue,
      maxSpiritPow:Math.max(0,animismMaxSpiritPow(binding)+magicModifier(this.character,'animism.maxSpiritPOW')),
      limit:animismSpiritLimit(rank,this.chaValue), damage:animismSpiritDamage(binding), rank,
    };
  }
  get mysticism():{meditation:number;value:number;path:string;totalIntensity:number;talentIntensity:number;trainedLimit:number} {
    const meditation=this.relatedSkill('Meditation')||0;
    const value=this.relatedSkill('Mysticism')||0;
    return {
      meditation, value, path:this.character.magic?.path?.path||this.character.mysticalOrder?.paths||'',
      totalIntensity:Math.max(0,mysticismTotalIntensity(meditation)+magicModifier(this.character,'mysticism.totalIntensity')),
      talentIntensity:mysticismTalentIntensity(value), trainedLimit:mysticismTrainedLimit(this.powValue),
    };
  }
  get sorcery():{invocation:number;shaping:number;intensity:number;memoryLimit:number;known:number} {
    const invocation=this.relatedSkill('Invocation')||0;
    return {
      invocation, shaping:this.relatedSkill('Shaping')||0, intensity:sorceryIntensity(invocation),
      memoryLimit:sorceryMemoryLimit(this.intValue), known:(this.character.magic?.sorcery||[]).length,
    };
  }
  get theismCultName():string {return this.character.theistCult?.name||'';}
  get theismRank():string {return this.character.theistCult?.level||'';}
  /** The sheet renders a list of cult memberships. The model still stores one
   * theistic cult, so this returns a single entry; multiple cults with their own
   * pools become a data change, not a template rewrite (see
   * design/COMPANION-OPEN-QUESTIONS.md §3.1). */
  get theismAdherents():{name:string;rank:string;value:number;exhort:number;capacity:number;
    maximum:number;current:number;manual:boolean;intensity:number}[] {
    return [{
      name:this.theismCultName||'Культ не выбран',
      rank:this.theismRank,
      value:this.devotionValue,
      exhort:this.exhortValue,
      capacity:this.devotionCapacity,
      maximum:this.devotionMaximum,
      current:this.devotionCurrent,
      manual:this.devotionIsManual,
      intensity:this.theismIntensityValue,
    }];
  }
  trackCult(_index:number,cult:{name:string}):string {return cult.name;}
  /** ТЗ §8.1: with several cults this becomes the sum over all adherents. */
  get theismPoolSum():number {return this.theismAdherents.reduce((sum,cult)=>sum+cult.current,0);}
  get theismPoolRemaining():number {return Math.max(0,this.powValue-this.theismPoolSum);}

  get traditions():Tradition[] {
    const m=this.character.magic;
    const ret:Tradition[]=[];
    const add=(title:string,subtitle:string,spells:any[],skills:string[],showEmpty=false)=>{
      if(!spells?.length&&!showEmpty)return;
      ret.push({title,subtitle,spells:spells.map(x=>typeof x==='string'?{name:x,description:''}:{name:x.name||'Без названия',description:x.description||'',tags:x.tags||''}),skills});
    };
    add('Theism',this.character.theistCult?.name||'Чудеса',m.miracles,['Devotion','Exhort'],this.character.devotionPool!=null||this.character.devotionPoolCurrent!=null||!!this.character.theistCult?.name||(this.relatedSkill('Devotion')||0)>0||(this.relatedSkill('Exhort')||0)>0);
    add('Folk Magic','Народная магия',m.folk,['Folk Magic'],(this.relatedSkill('Folk Magic')||0)>0);
    add('Sorcery',this.character.sorceryOrder?.name||'Колдовство',m.sorcery,['Invocation','Shaping'],!!this.character.sorceryOrder?.name||(this.relatedSkill('Invocation')||0)>0||(this.relatedSkill('Shaping')||0)>0);
    const mysticismTrained=!!this.character.mysticalOrder?.name||!!this.character.magic?.path?.path||
      (this.relatedSkill('Meditation')||0)>0||(this.relatedSkill('Mysticism')||0)>0;
    add('Mysticism · Augmentations',this.character.mysticalOrder?.name||'',m.path?.augmentations||[],['Meditation','Mysticism'],mysticismTrained);
    add('Mysticism · Invocations',this.character.mysticalOrder?.name||'',m.path?.invocations||[],['Meditation','Mysticism'],mysticismTrained);
    add('Mysticism · Enhancements',this.character.mysticalOrder?.name||'',m.path?.enhancements||[],['Meditation','Mysticism'],mysticismTrained);
    add('Other magic','Дополнительная магия',m.custom||[],[]);
    if(m.spirits||this.character.animistCult?.name||(this.relatedSkill('Trance')||0)>0||(this.relatedSkill('Binding')||0)>0)
      ret.push({title:'Animism',subtitle:this.character.animistCult?.name||'Духи',spells:m.spirits?[{name:'Духи',description:m.spirits}]:[],skills:['Trance','Binding']});
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

  get equipmentSlots():LocationDisplay[]{return this.locations;}
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
