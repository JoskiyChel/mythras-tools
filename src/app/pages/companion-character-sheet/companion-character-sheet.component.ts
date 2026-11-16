import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { Component, DoCheck, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Character } from '../../model/character';
import { Skill } from '../../model/skill';
import { CombatStyle } from '../../model/combat-style';
import { CharacterWeapon } from '../../model/character-weapon';
import { Weapon } from '../../model/weapon';
import { Item } from '../../model/item';
import { Equipment } from '../../model/equipment';
import { SpecialEffectsService } from '../../services/special-effects.service';
import { WeaponService } from '../../services/weapon.service';
import { ARMOUR_PRESETS, ArmourPreset, applyArmourPreset } from '../../services/armour-catalog';
import ToolsShop from '../../jsons/tools-shop.json';
import { folkMagic, sorceryMagic, theismMagic } from '../../services/magic.service';
import { BuilderSection } from '../../services/builder-navigation';
import { Spell } from '../../model/spell';
import { AppStorageService, DebouncedSaveHandle } from '../../services/app-storage.service';
import { downloadJson } from '../../services/character-format';
import { getAllCombatStyles, getSkillBase } from '../../services/character-service.service';
import { HIT_LOCATION_RULES, HitLocation, hitLocationRule } from '../../services/hit-locations';
import {
  CompanionCharacter, CharacteristicKey, AttributeKey,
  CHARACTERISTICS, FATIGUE, FATIGUE_RULES, SheetEffect, SheetModifier, MagicStatKey,
  companionState, currentCharacteristic, skillTotal, attributeTotal, damageModifier,
  calculationCharacter, skillModifierTotal,
  magicPointMaximum, maxLocationHp, displayedLocationHp, initializePristineHitPoints, movementSummary,
  skillGroups, fatigueRule, canAct, changeLocationHp, findTraditionSkill, shapingPointMaximum,
  visibleProfessionalSkills,
  DIFFICULTY_STEPS, DifficultyStep, CheckThresholds, checkThresholds, augmentingBonus,
  WOUND_TYPES, MAJOR_WOUND_TYPES, locationInjuries, setLocationInjuries, magicModifier,
  theismPoolLimit, theismIntensity, animismMaxSpiritPow, animismSpiritLimit,
  animismSpiritDamage, mysticismTotalIntensity, mysticismTalentIntensity, mysticismTrainedLimit,
  sorceryIntensity, sorceryMemoryLimit, folkMagicStartingSpells,
} from '../../services/companion-sheet';
import { DiceRollResult, resultFromValues, rollDice } from '../../services/dice';
import { SkillCheckResult, resolveSkillCheck } from '../../services/skill-check';

interface SheetInfo { title:string; source?:string; sections:{label:string;paragraphs:string[]}[]; }
interface CheckHistoryEntry { skill:string; difficulty:string; roll:number; label:string; outcome:string; }
interface DiceHistoryEntry { expression:string; total:number; mode:'virtual'|'manual'; }

type SheetTab = 'weapons'|'magic'|'armour'|'equipment'|'notes';
/** Geometry of one part of the anatomical plate. `path` is the whole part,
 * `stubPath` what remains after a dismemberment, `seam` is the cut line and
 * `impale` a through-line with its entry point. */
interface LocationGeometry {
  path:string;
  stubPath?:string;
  seam?:string;
  impale:[number,number,number,number];
  anchorX:number;
  anchorY:number;
  /** Relative scar line, sized for the part; defaults to a long diagonal. */
  scar?:string;
  /** Label position after a dismemberment, so it stays on the remaining stub. */
  stubAnchorY?:number;
}
interface LocationDisplay extends LocationGeometry {
  key: HitLocation; label:string; roll:string;
}
interface Tradition { title:string; subtitle:string; spells:{name:string;description?:string;tags?:string}[]; skills:string[]; }

/** Drawing only: labels, order and d20 ranges come from services/hit-locations.ts.
 * Front-facing mannequin on a stone plate; anatomical right is on the viewer's left.
 * Coordinates live in a 300 × 470 viewBox. */
const LOCATION_GEOMETRY: Record<HitLocation, LocationGeometry> = {
  head: {
    path:'M150 14c-16 0-26 12-26 28 0 13 8 25 26 33 18-8 26-20 26-33 0-16-10-28-26-28Z',
    seam:'M132 72Q150 80 168 72',
    impale:[106,32,146,46],
    anchorX:150, anchorY:44,
    scar:'M-9 -3L7 4M-6 1L5 6',
  },
  chest: {
    path:'M104 96C116 84 132 80 150 80s34 4 46 16l-7 42-4 54c-11 5-23 7-35 7s-24-2-35-7l-4-54Z',
    seam:'M104 190Q150 202 196 190',
    impale:[84,120,154,138],
    anchorX:150, anchorY:144,
  },
  abdoment: {
    path:'M112 202c12 5 26 7 38 7s26-2 38-7l5 46-2 30c-13 5-27 8-41 8s-28-3-41-8l-2-30Z',
    seam:'M112 282Q150 294 188 282',
    impale:[92,248,156,246],
    anchorX:150, anchorY:244,
  },
  rightArm: {
    path:'M106 98C92 100 84 108 81 122L75 194C74 202 79 207 85 206L89 248C90 260 87 270 91 275C97 281 105 277 106 266L109 210L115 150L118 112Z',
    stubPath:'M106 98C92 100 84 108 81 122L77 158L94 162L101 124Z',
    seam:'M77 158L94 162',
    impale:[50,206,86,198],
    anchorX:90, anchorY:214, stubAnchorY:140,
    scar:'M-6 -5L5 4M-4 -1L4 6',
  },
  leftArm: {
    path:'M194 98C208 100 216 108 219 122L225 194C226 202 221 207 215 206L211 248C210 260 213 270 209 275C203 281 195 277 194 266L191 210L185 150L182 112Z',
    stubPath:'M194 98C208 100 216 108 219 122L223 158L206 162L199 124Z',
    seam:'M223 158L206 162',
    impale:[250,206,214,198],
    anchorX:210, anchorY:214, stubAnchorY:140,
    scar:'M-6 -5L5 4M-4 -1L4 6',
  },
  rightLeg: {
    path:'M122 286C112 292 108 304 108 318L104 370C104 380 109 386 115 386L113 436C113 448 109 455 117 458C125 461 132 453 132 443L134 386C140 382 142 374 142 364L146 292Z',
    stubPath:'M122 286C112 292 108 304 108 318L106 360L134 360L140 318L146 292Z',
    seam:'M106 360L134 360',
    impale:[86,336,124,346],
    anchorX:120, anchorY:404, stubAnchorY:340,
    scar:'M-7 -4L6 4M-5 0L4 5',
  },
  leftLeg: {
    path:'M178 286C188 292 192 304 192 318L196 370C196 380 191 386 185 386L187 436C187 448 191 455 183 458C175 461 168 453 168 443L166 386C160 382 158 374 158 364L154 292Z',
    stubPath:'M178 286C188 292 192 304 192 318L194 360L166 360L160 318L154 292Z',
    seam:'M194 360L166 360',
    impale:[214,336,176,346],
    anchorX:180, anchorY:404, stubAnchorY:340,
    scar:'M-7 -4L6 4M-5 0L4 5',
  },
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
export class CompanionCharacterSheetComponent implements OnInit, OnDestroy, DoCheck {
  readonly storage=inject(AppStorageService);
  private readonly router=inject(Router);
  private readonly specialEffects=inject(SpecialEffectsService);
  private readonly weapons=inject(WeaponService);
  readonly weaponCatalog:Weapon[]=this.weapons.getWeapons();
  readonly armourPresets=ARMOUR_PRESETS;
  readonly toolsCatalog=(ToolsShop as {item:string;enc:string;cost:string}[]);
  picker:'weapon'|'armour'|'item'|'spell'|null=null;
  pickerQuery='';
  weaponStyleOnly=false;
  armourLocation:HitLocation='chest';
  spellTradition:'folk'|'sorcery'|'miracles'|null=null;
  private saveHandle?:DebouncedSaveHandle;
  /** Session-only character snapshots. Never persisted in the character JSON. */
  private readonly historyPast:string[]=[];
  private readonly historyFuture:string[]=[];
  private historySnapshot='';
  private restoringHistory=false;
  private readonly historyLimit=30;
  character!:CompanionCharacter;
  readonly characteristics=CHARACTERISTICS;
  readonly fatigueLevels=FATIGUE;
  readonly fatigueRules=FATIGUE_RULES;
  fatigueTableOpen=false;
  readonly characteristicModifierOptions=CHARACTERISTICS.map(key=>({key,label:key.toUpperCase()}));
  readonly attributeModifierOptions=ATT_KEYS.map(x=>({key:x.key,label:x.name}));
  readonly locationHpOptions=HIT_LOCATION_RULES.map(rule=>({key:rule.key,label:rule.labelRu}));
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
  /** A check is always resolved against one selected difficulty step. */
  selectedDifficulty:DifficultyStep=DIFFICULTY_STEPS[3];
  checkRollMode:'virtual'|'manual'='virtual';
  manualCheckRoll:number|null=null;
  checkDiceResult:DiceRollResult|null=null;
  checkResult:SkillCheckResult|null=null;
  checkError='';
  /** Deliberately session-only: these records are never written to the character. */
  readonly checkHistory:CheckHistoryEntry[]=[];
  diceDialog=false;
  diceExpression='1d100';
  diceMode:'virtual'|'manual'='virtual';
  diceResult:DiceRollResult|null=null;
  diceError='';
  manualDiceValues='';
  readonly diceHistory:DiceHistoryEntry[]=[];
  /** Animation is a presentation preference; it never changes a roll. */
  diceAnimation=true;
  diceAnimating=false;
  checkAnimating=false;
  private animationTimer?:ReturnType<typeof setTimeout>;
  /** Mobile: the skills panel is a drawer, closed by default. */
  skillsOpen=false;
  /** HP to deal or restore with a single click. The amount is shared by all locations. */
  hpAmount=1;
  openedWeapon=-1;
  openedSpell='';
  upgrade=false;
  draftStats:Partial<Record<CharacteristicKey,number>>={};
  readonly draftSkills=new Map<Skill,number>();
  /** Professional skills learned inside the sheet before the draft is applied. */
  readonly draftAddedSkills: Skill[]=[];
  newSkillName='';
  addingEffect=false;
  editingEffectId:string|null=null;
  editingInjury:SheetEffect['injury']=undefined;
  effectName=''; effectDuration=''; effectDescription='';
  newModifiers:SheetModifier[]=[];
  editingEquipment=false;

  ngOnInit():void {
    this.character=this.storage.readCharacter('view-character') as CompanionCharacter;
    const hpInitialised=initializePristineHitPoints(this.character);
    this.refreshSkillModifierOptions();
    this.historySnapshot=JSON.stringify(this.character);
    this.saveHandle=this.storage.createDebouncedSave(()=>this.save(),350);
    if(hpInitialised)this.saveHandle.schedule();
  }
  ngOnDestroy():void {this.clearAnimationTimer();this.saveHandle?.flush();this.saveHandle?.destroy();}
  ngDoCheck():void {
    if(!this.character||this.restoringHistory)return;
    const snapshot=JSON.stringify(this.character);
    if(!this.historySnapshot){
      this.historySnapshot=snapshot;
      return;
    }
    if(snapshot===this.historySnapshot)return;
    this.historyPast.push(this.historySnapshot);
    if(this.historyPast.length>this.historyLimit)this.historyPast.splice(0,this.historyPast.length-this.historyLimit);
    this.historyFuture.length=0;
    this.historySnapshot=snapshot;
  }
  private refreshSkillModifierOptions():void {
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
  }
  get canUndo():boolean {return !this.upgrade&&this.historyPast.length>0;}
  get canRedo():boolean {return !this.upgrade&&this.historyFuture.length>0;}
  undoChange():void {this.restoreHistory(false);}
  redoChange():void {this.restoreHistory(true);}
  private restoreHistory(redo:boolean):void {
    if(this.upgrade)return;
    const from=redo?this.historyFuture:this.historyPast;
    const to=redo?this.historyPast:this.historyFuture;
    const snapshot=from.pop();
    if(snapshot===undefined)return;
    const current=JSON.stringify(this.character);
    to.push(current);
    if(to.length>this.historyLimit)to.splice(0,to.length-this.historyLimit);
    this.restoringHistory=true;
    try{
      this.character=JSON.parse(snapshot) as CompanionCharacter;
      this.historySnapshot=snapshot;
      this.refreshSkillModifierOptions();
      this.saveHandle?.schedule();
    }finally{
      this.restoringHistory=false;
    }
  }
  @HostListener('document:input') @HostListener('document:change') @HostListener('document:click')
  onEdit():void {this.saveHandle?.schedule();}
  @HostListener('window:beforeunload') @HostListener('window:pagehide')
  flush():void {this.saveHandle?.flush();}
  @HostListener('document:keydown.escape') onEscape():void {this.activeSkill=null;this.activeInfo=null;this.movementDialog=false;this.diceDialog=false;this.cancelEffect();this.fatigueTableOpen=false;}
  save():void {if(this.character)this.storage.saveCharacter(this.character,'view-character');}
  editInBuilder(section?:BuilderSection,focus?:string):void {
    this.flush();if(this.storage.error)return;
    this.storage.setJson('creation-character',this.character);
    if(this.storage.error)return;
    this.router.navigate(['/character-creation'],section?{queryParams:{section,...(focus?{focus}:{})}}:{});
  }
  exportJson():void {this.flush();downloadJson(this.character,(this.character.name||'character')+'.json');}

  get groups(){
    const groups=skillGroups(this.character).map(g=>({...g,skills:[...g.skills]}));
    if(this.upgrade&&this.draftAddedSkills.length){
      const professional=groups[2]||groups[groups.length-1];
      professional.skills=[...professional.skills,...this.draftAddedSkills]
        .filter((skill,index,all)=>all.indexOf(skill)===index);
    }
    const query=this.query.toLowerCase();
    return groups.map(g=>({...g,skills:g.skills.filter(s=>s.name.toLowerCase().includes(query))}));
  }
  get styles(){return getAllCombatStyles(this.character);}
  get visiblePassions(){return (this.character.passions||[]).filter(p=>Boolean(p?.passion?.trim()));}
  charValue(key:CharacteristicKey):number {return currentCharacteristic(this.character,key,this.upgrade?this.draftStats:{});}
  charBase(key:CharacteristicKey):number {return currentCharacteristic(this.character,key);}
  skillValue(skill:Skill):number {
    if(this.upgrade&&this.isDraftAdded(skill)){
      return getSkillBase(calculationCharacter(this.character,this.draftStats),skill)
        +skillModifierTotal(this.character,skill)+(this.draftSkills.get(skill)||0);
    }
    return skillTotal(this.character,skill,this.upgrade?this.draftStats:{},this.upgrade?(this.draftSkills.get(skill)||0):0);
  }
  oldSkillValue(skill:Skill):number {return skillTotal(this.character,skill);}
  indirectSkillDelta(skill:Skill):number {
    if(this.isDraftAdded(skill))return 0;
    return this.skillValue(skill)-this.oldSkillValue(skill)-(this.draftSkills.get(skill)||0);
  }
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
    this.selectedDifficulty=DIFFICULTY_STEPS[3];
    this.resetCheckRoll();
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
  chooseAugment(skill:Skill):void {if(skill===this.activeSkill)return;this.augmentSkill=skill;this.augmentQuery='';this.resetCheckRoll();}
  clearAugment():void {this.augmentSkill=null;this.augmentQuery='';this.resetCheckRoll();}
  thresholds(step:DifficultyStep):CheckThresholds {
    return checkThresholds(this.activeSkill?this.skillValue(this.activeSkill):0,step,this.augmentValue);
  }
  get selectedThresholds():CheckThresholds {return this.thresholds(this.selectedDifficulty);}
  selectDifficulty(step:DifficultyStep):void {
    this.selectedDifficulty=step;
    this.resetCheckRoll();
  }
  setCheckMode(mode:'virtual'|'manual'):void {
    if(this.checkRollMode===mode)return;
    this.checkRollMode=mode;
    this.resetCheckRoll();
  }
  resetCheckRoll():void {
    this.manualCheckRoll=null;
    this.checkDiceResult=null;
    this.checkResult=null;
    this.checkError='';
  }
  /** Resolve against the selected grade; the virtual die is a real d100. */
  rollCheck():void {
    if(!this.activeSkill)return;
    const target=this.selectedThresholds;
    this.checkError='';
    if(target.mode!=='normal'){
      this.checkDiceResult=null;
      this.checkResult=resolveSkillCheck(0,target);
      return;
    }
    try{
      let roll:number;
      if(this.checkRollMode==='virtual'){
        const virtual=rollDice('1d100');
        this.checkDiceResult=virtual;
        roll=virtual.total;
      }else{
        roll=Number(this.manualCheckRoll);
        this.checkDiceResult=null;
      }
      this.checkResult=resolveSkillCheck(roll,target);
      if(!this.checkResult)return;
      this.checkHistory.unshift({
        skill:this.activeSkill.name,
        difficulty:this.selectedDifficulty.name,
        roll:this.checkResult.roll ?? 0,
        label:this.checkResult.label,
        outcome:this.checkResult.outcome,
      });
      this.checkHistory.splice(10);
      this.animateDiceResult('check');
    }catch(error){
      this.checkResult=null;
      this.checkError=error instanceof Error?error.message:'Не удалось выполнить бросок.';
    }
  }
  toggleDiceAnimation():void {
    this.diceAnimation=!this.diceAnimation;
    if(!this.diceAnimation)this.clearAnimationTimer();
  }
  private animateDiceResult(target:'dice'|'check'):void {
    if(!this.diceAnimation)return;
    this.clearAnimationTimer();
    this.diceAnimating=false;
    this.checkAnimating=false;
    this.animationTimer=setTimeout(()=>{
      if(target==='dice')this.diceAnimating=true;
      else this.checkAnimating=true;
      this.animationTimer=setTimeout(()=>{
        this.diceAnimating=false;
        this.checkAnimating=false;
      },420);
    },0);
  }
  private clearAnimationTimer():void {
    if(this.animationTimer!==undefined){
      clearTimeout(this.animationTimer);
      this.animationTimer=undefined;
    }
    this.diceAnimating=false;
    this.checkAnimating=false;
  }
  clearCheckHistory():void {this.checkHistory.splice(0);}
  setDiceMode(mode:'virtual'|'manual'):void {
    if(this.diceMode===mode)return;
    this.diceMode=mode;
    this.diceResult=null;
    this.diceError='';
    this.manualDiceValues='';
  }
  useDicePreset(expression:string):void {
    this.diceExpression=expression;
    this.diceResult=null;
    this.diceError='';
  }
  rollDiceExpression():void {
    try{
      const result=rollDice(this.diceExpression);
      this.diceResult=result;
      this.diceError='';
      this.rememberDice(result,'virtual');
      this.animateDiceResult('dice');
    }catch(error){
      this.diceResult=null;
      this.diceError=error instanceof Error?error.message:'Не удалось выполнить бросок.';
    }
  }
  acceptManualDice():void {
    try{
      const values=this.manualDiceValues
        .split(/[\s,;]+/)
        .filter(value=>value.length)
        .map(value=>Number(value));
      const result=resultFromValues(this.diceExpression,values);
      this.diceResult=result;
      this.diceError='';
      this.rememberDice(result,'manual');
      this.animateDiceResult('dice');
    }catch(error){
      this.diceResult=null;
      this.diceError=error instanceof Error?error.message:'Проверьте введённые значения.';
    }
  }
  private rememberDice(result:DiceRollResult,mode:'virtual'|'manual'):void {
    this.diceHistory.unshift({expression:result.normalized,total:result.total,mode});
    this.diceHistory.splice(10);
  }
  diceBreakdown(result:DiceRollResult):string {
    const dice=result.terms
      .map(term=>term.values.join(' + '))
      .join(' + ');
    if(!result.modifier)return `${dice} = ${result.total}`;
    return `${dice} ${result.modifier>0?'+':'−'} ${Math.abs(result.modifier)} = ${result.total}`;
  }
  clearDiceHistory():void {this.diceHistory.splice(0);}
  attr(key:'ap'|'healing'|'init'|'luck'|'expMod'):number {
    return attributeTotal(this.character,key,this.upgrade?this.draftStats:{});
  }
  attrOld(key:'ap'|'healing'|'init'|'luck'|'expMod'):number {
    return attributeTotal(this.character,key);
  }
  /** Derived attributes must show the same up/down preview as skills while a
   * characteristic edit is still a draft. */
  attrDelta(key:'ap'|'healing'|'init'|'luck'|'expMod'):number {
    return this.upgrade ? this.attr(key) - this.attrOld(key) : 0;
  }
  get mpDelta():number {
    return this.upgrade ? this.mpMax - magicPointMaximum(this.character) : 0;
  }
  get movementDelta():number {
    return this.upgrade ? this.currentMovement - movementSummary(this.character).walking : 0;
  }
  private damageScore(value:string):number {
    const match=value.match(/[+-]?\d+/);
    return match?Number(match[0]):0;
  }
  get damageDelta():number {
    return this.upgrade ? this.damageScore(this.damage) - this.damageScore(damageModifier(this.character)) : 0;
  }
  deltaText(delta:number):string {
    return (delta>0?'↑ +':'↓ −')+Math.abs(delta);
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
  removeEffect(id:string):void {
    const effect=this.effects.find(entry=>entry.id===id);
    if(effect?.injury){
      const remaining=locationInjuries(this.character,effect.injury.location)
        .filter(type=>type!==effect.injury!.type);
      setLocationInjuries(this.character,effect.injury.location,remaining);
    }
    companionState(this.character).effects=this.effects.filter(x=>x.id!==id);
  }
  openEffectDialog(effect?:SheetEffect):void {
    this.addingEffect=true;
    this.editingEffectId=effect?.id??null;
    this.editingInjury=effect?.injury?{...effect.injury}:undefined;
    this.effectName=effect?.name??'';
    this.effectDuration=effect?.duration??'';
    this.effectDescription=effect?.description??'';
    this.newModifiers=(effect?.modifiers??[]).map(modifier=>({...modifier}));
  }
  addModifier():void {this.newModifiers.push({kind:'characteristic',key:'str',amount:1});}
  modifierOptions(kind:SheetModifier['kind']):{key:string;label:string;skillId?:string}[] {
    if(kind==='characteristic')return this.characteristicModifierOptions;
    if(kind==='attribute')return this.attributeModifierOptions;
    if(kind==='magic')return this.magicModifierOptions;
    if(kind==='locationHp')return this.locationHpOptions;
    return this.skillModifierOptions;
  }
  modifierLabel(mod:SheetModifier):string {
    const kindLabel:Record<SheetModifier['kind'],string>={characteristic:'Характеристика',skill:'Навык',attribute:'Атрибут',magic:'Магия',locationHp:'Максимальное здоровье'};
    const target=this.modifierOptions(mod.kind).find(option=>option.key===mod.key)?.label??mod.key;
    return kindLabel[mod.kind]+': '+target+' '+(mod.amount>0?'+':'')+mod.amount;
  }
  trackModifierOption(_index:number,option:{key:string}):string{return option.key;}
  setModifierKind(mod:SheetModifier,kind:SheetModifier['kind']):void {
    mod.kind=kind;mod.key=this.modifierOptions(kind)[0]?.key||'';delete mod.skillId;
    if(kind==='locationHp'&&mod.amount>0)mod.amount=-1;
  }
  setModifierKey(mod:SheetModifier,key:string):void {
    mod.key=key;
    const option=this.modifierOptions(mod.kind).find(entry=>entry.key===key);
    if(option?.skillId)mod.skillId=option.skillId;else delete mod.skillId;
  }
  private newEffectId():string {
    return (globalThis.crypto as Crypto|undefined)?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  }
  applyEffect():void {
    if(!this.effectName.trim())return;
    const effect:SheetEffect={id:this.editingEffectId??this.newEffectId(),name:this.effectName.trim(),
      duration:this.effectDuration.trim(),description:this.effectDescription.trim(),
      modifiers:this.newModifiers.map(x=>({...x,amount:Number(x.amount)||0})),
      ...(this.editingInjury?{injury:{...this.editingInjury}}:{})};
    companionState(this.character).effects=this.editingEffectId
      ? this.effects.map(entry=>entry.id===this.editingEffectId?effect:entry)
      : [...this.effects,effect];
    this.cancelEffect();
  }
  cancelEffect():void {
    this.addingEffect=false;this.editingEffectId=null;this.editingInjury=undefined;
    this.effectName='';this.effectDuration='';this.effectDescription='';this.newModifiers=[];
  }
  private injuryEffectName(location:HitLocation,type:string):string {
    const names:Record<HitLocation,string>={head:'голова',chest:'грудь',abdoment:'живот',
      rightArm:'правая рука',leftArm:'левая рука',rightLeg:'правая нога',leftLeg:'левая нога'};
    const genitive:Record<HitLocation,string>={head:'головы',chest:'груди',abdoment:'живота',
      rightArm:'правой руки',leftArm:'левой руки',rightLeg:'правой ноги',leftLeg:'левой ноги'};
    const name=names[location];
    switch(type){
      case 'Отсечена':return 'Отсечённая '+name;
      case 'Увечье':return 'Увечье '+genitive[location];
      case 'Пронзена':return 'Пронзение: '+name;
      case 'Кровотечение':return 'Кровотечение: '+name;
      case 'Шрам':return 'Шрам: '+name;
      default:return type+': '+name;
    }
  }
  private injuryEffectDescription(type:string):string {
    return type==='Увечье'
      ? 'Жертва навсегда теряет 1 пункт очков здоровья в поражённой локации из-за некроза тканей.'
      : '';
  }
  private openInjuryEffect(location:HitLocation,type:string):void {
    let effect=this.effects.find(entry=>entry.injury?.location===location&&entry.injury?.type===type);
    if(effect&&type==='Увечье'&&!(effect.modifiers||[]).some(mod=>mod.kind==='locationHp'&&mod.key===location)){
      effect.modifiers=[...(effect.modifiers||[]),{kind:'locationHp',key:location,amount:-1}];
    }
    if(!effect){
      effect={id:this.newEffectId(),name:this.injuryEffectName(location,type),
        duration:type==='Кровотечение'?'До остановки кровотечения':'Постоянно',
        description:this.injuryEffectDescription(type),
        modifiers:type==='Увечье'?[{kind:'locationHp',key:location,amount:-1}]:[],
        injury:{location,type}};
      companionState(this.character).effects=[...this.effects,effect];
    }
    this.openEffectDialog(effect);
  }
  private removeInjuryEffect(location:HitLocation,type:string):void {
    companionState(this.character).effects=this.effects
      .filter(entry=>!(entry.injury?.location===location&&entry.injury?.type===type));
  }
  setFatigue(value:string):void {this.character.fatigueLevel=value;}
  get currentFatigueRule(){return fatigueRule(this.character);}
  get canAct():boolean{return canAct(this.character);}
  get currentHp():number {return displayedLocationHp(this.character,this.selectedLocation,this.upgrade?this.draftStats:{});}
  maxHp(key:HitLocation):number {return maxLocationHp(this.character,key,this.upgrade?this.draftStats:{});}
  hp(key:HitLocation):number {return displayedLocationHp(this.character,key,this.upgrade?this.draftStats:{});}
  hpColour(key:HitLocation):string {
    const max=this.maxHp(key),n=this.hp(key);
    const major=[86,32,28], serious=[154,64,44], healthy=[198,106,63];
    const mix=(from:number[],to:number[],t:number)=>'rgb('+from.map((value,i)=>Math.round(value+(to[i]-value)*t)).join(',')+')';
    if(max<=0)return mix(major,serious,.5);
    // Continuous gradient: major at −max, serious at 0, clay at max.
    if(n<=0)return mix(major,serious,Math.max(0,Math.min(1,(n+max)/max)));
    return mix(serious,healthy,Math.max(0,Math.min(1,n/max)));
  }
  /** A wound changes the part itself: a severed part is drawn as the remaining
   * stub, a maimed one gets crumpled edges, an impaled one an embedded arrow. */
  partPath(loc:LocationDisplay):string {
    return this.hasWoundType(loc.key,'Отсечена')&&loc.stubPath?loc.stubPath:loc.path;
  }
  /** Bleeding and scars follow the remaining stump after dismemberment. */
  woundAnchorY(loc:LocationDisplay):number {
    return this.hasWoundType(loc.key,'Отсечена')&&loc.stubAnchorY!==undefined
      ? loc.stubAnchorY : loc.anchorY;
  }
  woundScarPath(loc:LocationDisplay):string {
    return loc.scar ?? 'M-14 -4L12 5M-10 2L8 9';
  }
  hasWoundType(key:HitLocation,type:string):boolean {
    return locationInjuries(this.character,key).includes(type);
  }
  injuryMark(key:HitLocation):boolean {return locationInjuries(this.character,key).length>0;}
  injuryText(key:HitLocation):string {return locationInjuries(this.character,key).join(', ');}
  hasInjury(type:string):boolean {return locationInjuries(this.character,this.selectedLocation).includes(type);}
  injuryAvailable(type:string):boolean {
    return type!=='Отсечена'||['leftArm','rightArm','leftLeg','rightLeg'].includes(this.selectedLocation);
  }
  toggleInjury(type:string):void {
    if(!this.injuryAvailable(type))return;
    const location=this.selectedLocation;
    const current=locationInjuries(this.character,location);
    if(current.includes(type)){
      setLocationInjuries(this.character,location,current.filter(value=>value!==type));
      this.removeInjuryEffect(location,type);
      return;
    }
    let next=[...current];
    if((MAJOR_WOUND_TYPES as readonly string[]).includes(type)){
      // Dismemberment, maim and impalement are mutually exclusive on one location.
      for(const legacy of current.filter(value=>(MAJOR_WOUND_TYPES as readonly string[]).includes(value))){
        this.removeInjuryEffect(location,legacy);
      }
      next=next.filter(value=>!(MAJOR_WOUND_TYPES as readonly string[]).includes(value));
    }
    next.push(type);
    setLocationInjuries(this.character,location,next);
    this.openInjuryEffect(location,type);
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
  // ---- In-sheet pickers: weapons, armour, items and spells -----------------
  get pickerTitle():string {
    if(this.picker==='weapon')return 'Добавить оружие';
    if(this.picker==='armour')return 'Броня: '+hitLocationRule(this.armourLocation).labelRu;
    if(this.picker==='item')return 'Добавить снаряжение';
    if(this.picker==='spell')return this.spellTradition==='folk'?'Folk Magic · заклинание':
      this.spellTradition==='sorcery'?'Sorcery · заклинание':'Theism · чудо';
    return '';
  }
  closePicker():void {this.picker=null;this.pickerQuery='';}
  openWeaponPicker():void {this.picker='weapon';this.pickerQuery='';}
  private get styleWeaponTokens():string[] {
    const styles=this.character?.skills?.combatstyles||[];
    return [...new Set(styles.flatMap(style=>Object.values(style.weapons||{})
      .flatMap(value=>String(value||'').split(','))
      .map(value=>value.trim().toLowerCase())
      .filter(value=>value.length>1)))]
      .filter(value=>value!=='any'&&!value.startsWith('any '));
  }
  private weaponFitsStyle(weapon:Weapon):boolean {
    const name=weapon.name.toLowerCase();
    return this.styleWeaponTokens.some(token=>name.includes(token)||token.includes(name));
  }
  get filteredWeapons():Weapon[] {
    const query=this.pickerQuery.trim().toLowerCase();
    return this.weaponCatalog
      .filter(weapon=>!query||weapon.name.toLowerCase().includes(query))
      .filter(weapon=>!this.weaponStyleOnly||this.weaponFitsStyle(weapon))
      .slice()
      .sort((a,b)=>a.name.localeCompare(b.name));
  }
  addWeapon(weapon:Weapon):void {
    const copy=Object.assign(new CharacterWeapon(weapon.name,{}),weapon,{equipped:false,quantity:1});
    this.character.equipment.weapons.push(copy);
    this.closePicker();
  }
  weaponPickerDamage(weapon:Weapon):string {
    return weapon.damage||weapon.oneHanded||weapon.twoHanded||weapon.ranged||weapon.unarmed||'—';
  }
  openArmourPicker(location:HitLocation):void {
    this.armourLocation=location;this.picker='armour';this.pickerQuery='';
  }
  get filteredArmourPresets():ArmourPreset[] {
    const query=this.pickerQuery.trim().toLowerCase();
    return this.armourPresets.filter(preset=>!query||
      [preset.type,preset.construction,preset.material].join(' ').toLowerCase().includes(query));
  }
  chooseArmour(preset:ArmourPreset):void {
    const equipment=this.character.equipment[this.armourLocation]
      ?? (this.character.equipment[this.armourLocation]=new Equipment());
    applyArmourPreset(equipment,preset.id);
    equipment.equipped=true;
    this.closePicker();
  }
  openItemPicker():void {this.picker='item';this.pickerQuery='';}
  get filteredItems():{item:string;enc:string;cost:string}[] {
    const query=this.pickerQuery.trim().toLowerCase();
    return this.toolsCatalog.filter(entry=>!query||entry.item.toLowerCase().includes(query));
  }
  addItem(entry:{item:string;enc:string;cost:string}):void {
    this.character.equipment.items.push({name:entry.item,description:'',quantity:1,ap:0,hp:0,
      enc:Number(entry.enc)||0,cost:Number(entry.cost)||0} as Item);
    this.closePicker();
  }
  openSpellPicker(tradition:'folk'|'sorcery'|'miracles'):void {
    this.spellTradition=tradition;this.picker='spell';this.pickerQuery='';
  }
  private get spellCatalog():{name:string;tags?:string;description:string}[] {
    if(this.spellTradition==='folk')return folkMagic;
    if(this.spellTradition==='sorcery')return sorceryMagic;
    return theismMagic;
  }
  private get knownSpells():Spell[] {
    if(this.spellTradition==='folk')return this.character.magic.folk;
    if(this.spellTradition==='sorcery')return this.character.magic.sorcery;
    return this.character.magic.miracles;
  }
  get filteredSpells():{name:string;tags?:string;description:string}[] {
    const query=this.pickerQuery.trim().toLowerCase();
    const known=new Set(this.knownSpells.map(spell=>spell.name));
    return this.spellCatalog.filter(spell=>!known.has(spell.name))
      .filter(spell=>!query||spell.name.toLowerCase().includes(query)||
        (spell.tags||'').toLowerCase().includes(query))
      .sort((a,b)=>a.name.localeCompare(b.name));
  }
  addSpell(spell:{name:string;tags?:string;description:string}):void {
    this.knownSpells.push({name:spell.name,tags:spell.tags||'',description:spell.description||''});
    this.closePicker();
  }
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

  beginUpgrade():void {this.upgrade=true;this.draftStats={};this.draftSkills.clear();this.draftAddedSkills.length=0;this.newSkillName='';}
  discardUpgrade():void {this.upgrade=false;this.draftStats={};this.draftSkills.clear();this.draftAddedSkills.length=0;this.newSkillName='';}
  get hasUpgrade(){return Object.values(this.draftStats).some(v=>v!==0)||[...this.draftSkills.values()].some(x=>x!==0)||this.draftAddedSkills.length>0;}
  /** Professional skills from the catalogue that the character has not learned yet. */
  get addableSkills():Skill[] {
    const visible=new Set(visibleProfessionalSkills(this.character));
    const seen=new Set<string>();
    return (this.character.skills.skills||[])
      .filter(skill=>Boolean(skill?.professional)&&!visible.has(skill)&&!this.draftAddedSkills.includes(skill))
      .filter(skill=>{
        const key=skill.name.toLowerCase();
        if(seen.has(key))return false;
        seen.add(key);
        return true;
      })
      .sort((a,b)=>a.name.localeCompare(b.name));
  }
  isDraftAdded(skill:Skill):boolean {return this.draftAddedSkills.includes(skill);}
  addDraftSkill():void {
    const skill=this.addableSkills.find(candidate=>candidate.name===this.newSkillName);
    if(!skill)return;
    this.draftAddedSkills.push(skill);
    if(!this.draftSkills.has(skill))this.draftSkills.set(skill,0);
    this.newSkillName='';
  }
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
    for(const skill of this.draftAddedSkills)skill.force=true;
    this.discardUpgrade();
  }
  difficultyTarget(multiplier:number):number {return this.activeSkill?Math.ceil(this.skillValue(this.activeSkill)*multiplier):0;}
  stopOverlay(event:MouseEvent):void {if(event.target===event.currentTarget){this.activeSkill=null;this.activeInfo=null;this.movementDialog=false;this.diceDialog=false;this.cancelEffect();this.closePicker();this.fatigueTableOpen=false;}}
  // Getters return fresh grouping objects; stable keys retain the triggering
  // buttons so dialog focus restoration and keyboard navigation can work.
  trackGroup(_index:number,group:{name:string}):string{return group.name;}
  trackTradition(_index:number,tradition:Tradition):string{return tradition.title;}
  trackSpell(index:number,spell:{name:string}):string{return index+':'+spell.name;}
  trackSkill(_index:number,s:Skill):Skill{return s;}
  trackLocation(_index:number,loc:LocationDisplay):HitLocation{return loc.key;}
}
