import { Character } from '../model/character';
import { Skill } from '../model/skill';
import { getDamageModifier, getSkillTotal } from './character-service.service';
import { getMaximumHp, HitLocation, setCurrentHp } from './hit-points';

/** All supplementary data lives in a namespaced field. The original Mythras Tools
 * Character object stays the canonical source of characteristics, equipment and magic. */
export type CharacteristicKey = 'str'|'con'|'siz'|'dex'|'int'|'pow'|'cha';
export type AttributeKey = 'ap'|'healing'|'init'|'luck'|'expMod'|'damage'|'movement'|'magicPoints';
export type ModifierTarget = 'characteristic'|'skill'|'attribute';
export interface SheetModifier {
  kind: ModifierTarget;
  key: string;
  amount: number;
}
export interface SheetEffect {
  id: string;
  name: string;
  duration: string;
  /** Narrative-only effects are valid: modifiers may be empty. */
  description?: string;
  modifiers: SheetModifier[];
}
export interface CompanionState {
  effects?: SheetEffect[];
  gifts?: {id:string;name:string;description:string}[];
  equipmentNotes?: string;
  /** Records permanent injury independently of current HP. */
  injuries?: Partial<Record<HitLocation,string>>;
}
export type CompanionCharacter = Character & {
  companion?: CompanionState;
  currentValues?: Record<string, number|string|null>;
};
export const CHARACTERISTICS: CharacteristicKey[] = ['str','con','siz','dex','int','pow','cha'];
export const RESISTANCES = ['Brawn','Endurance','Evade','Willpower'];
/** Mythras Core Rules, p. 79: Fatigue Levels. */
export interface FatigueRule {
  level:string;
  skillGrade:string;
  movement:string;
  initiative:number|null;
  actionPoints:number|null;
  recovery:string;
  movementMode:'normal'|'minus1'|'minus2'|'half'|'immobile';
}
export const FATIGUE_RULES:FatigueRule[] = [
  {level:'Fresh',skillGrade:'Без штрафа',movement:'Без штрафа',initiative:0,actionPoints:0,recovery:'—',movementMode:'normal'},
  {level:'Winded',skillGrade:'Hard',movement:'Без штрафа',initiative:0,actionPoints:0,recovery:'15 мин',movementMode:'normal'},
  {level:'Tired',skillGrade:'Hard',movement:'−1 м',initiative:0,actionPoints:0,recovery:'3 ч',movementMode:'minus1'},
  {level:'Wearied',skillGrade:'Formidable',movement:'−2 м',initiative:-2,actionPoints:0,recovery:'6 ч',movementMode:'minus2'},
  {level:'Exhausted',skillGrade:'Formidable',movement:'½ скорости',initiative:-4,actionPoints:-1,recovery:'12 ч',movementMode:'half'},
  {level:'Debilitated',skillGrade:'Herculean',movement:'½ скорости',initiative:-6,actionPoints:-2,recovery:'18 ч',movementMode:'half'},
  {level:'Incapacitated',skillGrade:'Herculean',movement:'Неподвижен',initiative:-8,actionPoints:-3,recovery:'24 ч',movementMode:'immobile'},
  {level:'Semi-Conscious',skillGrade:'Hopeless',movement:'Действия невозможны',initiative:null,actionPoints:null,recovery:'36 ч',movementMode:'immobile'},
  {level:'Comatose',skillGrade:'Действия невозможны',movement:'Действия невозможны',initiative:null,actionPoints:null,recovery:'48 ч',movementMode:'immobile'},
  {level:'Dead',skillGrade:'Мёртв',movement:'—',initiative:null,actionPoints:null,recovery:'Никогда',movementMode:'immobile'},
];
export const FATIGUE = FATIGUE_RULES.map(rule=>rule.level);
export function fatigueRule(character:CompanionCharacter):FatigueRule {
  return FATIGUE_RULES.find(rule=>rule.level===character.fatigueLevel) || FATIGUE_RULES[0];
}
export function canAct(character:CompanionCharacter):boolean {
  return fatigueRule(character).initiative!==null;
}


export function companionState(character: CompanionCharacter): CompanionState {
  return character.companion ?? (character.companion = {});
}

export function modifierTotal(character: CompanionCharacter, kind: ModifierTarget, key: string): number {
  return (character.companion?.effects || []).reduce((total, effect) => total +
    (effect.modifiers || []).reduce((subtotal, mod) => subtotal +
      (mod.kind === kind && mod.key === key && Number.isFinite(Number(mod.amount)) ? Number(mod.amount) : 0), 0), 0);
}

/** Empty current values mean "no override"; the original characteristic is NOT 0. */
export function currentCharacteristic(character: CompanionCharacter, key: CharacteristicKey,
  tentative: Partial<Record<CharacteristicKey,number>> = {}): number {
  const current = character.currentValues?.[key];
  const original = character.skills[key];
  const hasManualOverride = current !== '' && current !== undefined && current !== null && Number.isFinite(Number(current));
  const selected = hasManualOverride ? Number(current) : Number(original) || 0;
  return selected + modifierTotal(character,'characteristic',key) + (tentative[key] || 0);
}

/** Copy for ALL calculations, leaving the constructor's source values untouched. */
export function calculationCharacter(character: CompanionCharacter,
  tentative: Partial<Record<CharacteristicKey,number>> = {}): Character {
  const skills = {...character.skills};
  for (const key of CHARACTERISTICS) skills[key] = currentCharacteristic(character,key,tentative);
  return {...character, skills} as Character;
}

export function skillTotal(character: CompanionCharacter, skill: Skill,
  tentative: Partial<Record<CharacteristicKey,number>> = {}, improvement = 0): number {
  return getSkillTotal(calculationCharacter(character,tentative),skill) +
    modifierTotal(character,'skill',skill.name) + improvement;
}

export function attributeTotal(character: CompanionCharacter, key: Exclude<AttributeKey,'damage'|'movement'|'magicPoints'>,
  tentative: Partial<Record<CharacteristicKey,number>> = {}): number {
  const attribute = character.skills[key];
  const base = getSkillTotal(calculationCharacter(character,tentative),attribute) + modifierTotal(character,'attribute',key);
  const fatigue = fatigueRule(character);
  if(key==='init') return fatigue.initiative===null?0:base-armourPenalty(character)+fatigue.initiative;
  if(key==='ap') return fatigue.actionPoints===null?0:Math.max(0,base+fatigue.actionPoints);
  return base;
}

/** Damage Modifier is dice notation, not a scalar. A flat bonus is displayed separately. */
export function damageModifier(character: CompanionCharacter,
  tentative: Partial<Record<CharacteristicKey,number>> = {}): string {
  const base = getDamageModifier(calculationCharacter(character,tentative));
  const bonus = modifierTotal(character,'attribute','damage');
  return bonus ? `${base} (${bonus > 0 ? '+' : ''}${bonus} flat)` : base;
}

export function movement(character: CompanionCharacter): number {
  const base = Math.max(0,(Number(character.movementRate) || 0) + modifierTotal(character,'attribute','movement'));
  switch(fatigueRule(character).movementMode){
    case 'minus1': return Math.max(0,base-1);
    case 'minus2': return Math.max(0,base-2);
    case 'half': return base/2;
    case 'immobile': return 0;
    default: return base;
  }
}

export function magicPointMaximum(character: CompanionCharacter,
  tentative: Partial<Record<CharacteristicKey,number>> = {}): number {
  return Math.max(0,currentCharacteristic(character,'pow',tentative) + modifierTotal(character,'attribute','magicPoints'));
}

export function maxLocationHp(character: CompanionCharacter, location: HitLocation,
  tentative: Partial<Record<CharacteristicKey,number>> = {}): number {
  return getMaximumHp(calculationCharacter(character,tentative),location);
}

/** Initialises a new/pristine character once, without touching wounds in any
 * save that contains at least one explicit current HP value (including 0).
 * For partially populated older saves, use displayedLocationHp fallback instead.
 * Returns true only when the save really changed. */
export function initializePristineHitPoints(character:CompanionCharacter):boolean {
  const keys:HitLocation[]=['head','chest','abdoment','leftArm','rightArm','leftLeg','rightLeg'];
  const current=character.currentHitPoints || {};
  const hasExplicitHp=keys.some(key=>current[key]!=='' && current[key]!==undefined &&
    current[key]!==null && Number.isFinite(Number(current[key])));
  if(hasExplicitHp)return false;
  const values={...current};
  for(const location of keys)values[location]=maxLocationHp(character,location);
  character.currentHitPoints=values;
  return true;
}

/** Newly created / legacy characters may omit current HP. Display full health
 * until a location has been explicitly changed. Do NOT write the fallback into
 * the legacy save; a real 0 or a negative value is always preserved. */
export function displayedLocationHp(character:CompanionCharacter, location:HitLocation,
  tentative:Partial<Record<CharacteristicKey,number>>={}):number {
  const raw=character.currentHitPoints?.[location];
  return raw===''||raw===null||raw===undefined||!Number.isFinite(Number(raw))
    ? maxLocationHp(character,location,tentative) : Number(raw);
}

/** Apply the supplied amount to one hit location in a single action.
 * Missing HP is treated as full for display, without filling any other location.
 * Healing stops at maximum; damage can reach negative HP (serious/major wounds). */
export function changeLocationHp(character:CompanionCharacter,location:HitLocation,delta:number):number {
  const before=displayedLocationHp(character,location);
  if(!Number.isSafeInteger(delta) || delta===0)return before;
  const next=Math.min(maxLocationHp(character,location),before+delta);
  setCurrentHp(character,location,next);
  return next;
}

/** Return the actual skill object from the canonical character model. That way
 * both the Magic tab and the Skills column use identical difficulty calculations.
 * Prefer the exact name; fall back to specialised names like Devotion (Lanis). */
export function findTraditionSkill(character:CompanionCharacter,name:string):Skill|null {
  const skills=character.skills;
  const list=[...(skills.skills||[]),...(skills.specialized||[]),
    ...(skills.extraProfessionalCultureSkills||[]),...(skills.extraProfessionalCareerSkills||[]),
    ...(skills.hobby?[skills.hobby]:[])].filter((skill):skill is Skill=>Boolean(skill));
  return list.find(skill=>skill.name===name)
    ||list.find(skill=>skill.name.startsWith(name+' ('))
    ||null;
}

/** Legacy Mythras Tools treats each armour location as an equipped slot, no new
 * parallel list of armour pieces is introduced at this stage. */
export function armourPenalty(character: CompanionCharacter): number {
  const overridden = Number(character.equipment?.armorPenalty);
  if (character.equipment?.armorPenalty !== undefined && Number.isFinite(overridden)) return overridden;
  // Unlike the legacy getOnlyArmor helper (which halves worn ENC for load),
  // the Armour Penalty uses the FULL ENC of every covered location.
  const keys:HitLocation[]=['head','chest','abdoment','leftArm','rightArm','leftLeg','rightLeg'];
  const enc=keys.reduce((sum,loc)=>sum+Math.max(0,Number(character.equipment?.[loc]?.enc)||0),0);
  return Math.ceil(enc/5);
}

export interface MovementSummary {
  walking:number;running:number;sprinting:number;horizontalJump:number;verticalJump:number;
  armourPenalty:number;athletics:number;heightMetres:number;
}
/** Reuses Mythras Tools locomotion baselines with the Fatigue table (p.79),
 * full armour initiative penalty (p.58) and running/jumping adjustments (p.70). */
export function movementSummary(character: CompanionCharacter): MovementSummary {
  const athletics = character.skills.skills.find(s=>s.name==='Athletics');
  const percent = athletics ? skillTotal(character,athletics) : 0;
  const walking = movement(character);
  const bonus = Math.floor(percent/25) * 0.5;
  const jumpBonus = Math.floor(percent/20);
  const h = Number(character.height) || 0;
  const heightMetres = h < 10 ? h : h/100;
  const penalty=armourPenalty(character);
  const standingJumpPenalty=Math.ceil(penalty/2)/2;
  const jumpPenalty=Math.ceil(penalty/2);
  const immobile=walking===0;
  return {
    walking,
    running:immobile?0:Math.max(0,(walking+bonus)*3-penalty),
    sprinting:immobile?0:Math.max(0,(walking+bonus)*5-penalty),
    horizontalJump:immobile?0:Math.max(0,heightMetres*2+jumpBonus-jumpPenalty),
    verticalJump:immobile?0:Math.max(0,heightMetres*2+jumpBonus*0.2-jumpPenalty),
    armourPenalty:penalty,
    athletics:percent,
    heightMetres
  };
}

export function visibleProfessionalSkills(character: CompanionCharacter): Skill[] {
  const skills=character.skills;
  const chosen=[...(skills.extraProfessionalCultureSkills||[]),...(skills.extraProfessionalCareerSkills||[]),skills.hobby].filter(Boolean);
  const found = [...(skills.skills||[]),...(skills.specialized||[]),
    ...(skills.extraProfessionalCultureSkills||[]),...(skills.extraProfessionalCareerSkills||[]),
    ...(skills.hobby?[skills.hobby]:[])];
  const seen = new Set<Skill>();
  return found.filter(s=>{
    if(!s||seen.has(s)||!s.professional)return false;
    seen.add(s);
    return Boolean(s.force || s.cultureBonus || s.careerBonus || s.extraBonus || chosen.includes(s) || chosen.some(c=>c.name===s.name));
  });
}

/** Names are descriptive, not guaranteed IDs: two distinct skills with the same
 * name are retained. No re-hydration or JSON normalisation is done by the sheet. */
export function skillGroups(character: CompanionCharacter): {name:string;skills:Skill[]}[] {
  const standard=character.skills.skills.filter(s=>s&&!s.professional);
  return [
    {name:'Сопротивления',skills:standard.filter(s=>RESISTANCES.includes(s.name))},
    {name:'Стандартные навыки',skills:standard.filter(s=>!RESISTANCES.includes(s.name))},
    {name:'Профессиональные навыки',skills:visibleProfessionalSkills(character)},
  ];
}

export function severity(hp:number,max:number): 'healthy'|'minor'|'serious'|'major' {
  if(hp<=-max)return 'major';
  if(hp<=0)return 'serious';
  return hp>=max?'healthy':'minor';
}
