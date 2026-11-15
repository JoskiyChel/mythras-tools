import { Character } from '../model/character';
import { Skill } from '../model/skill';
import { getDamageModifier, getSkillTotal } from './character-service.service';
import { getMaximumHp, HitLocation, setCurrentHp } from './hit-points';
import { HIT_LOCATION_ORDER } from './hit-locations';

/** All supplementary data lives in a namespaced field. The original Mythras Tools
 * Character object stays the canonical source of characteristics, equipment and magic. */
export type CharacteristicKey = 'str'|'con'|'siz'|'dex'|'int'|'pow'|'cha';
export type AttributeKey = 'ap'|'healing'|'init'|'luck'|'expMod'|'damage'|'movement'|'magicPoints';
export type ModifierTarget = 'characteristic'|'skill'|'attribute'|'magic';
/** Magic discipline statistics addressable by an effect (see design/COMPANION-OPEN-QUESTIONS.md). */
export type MagicStatKey = 'theism.poolMax'|'theism.intensity'|'animism.maxSpiritPOW'|'mysticism.totalIntensity'|'sorcery.shapingPoints';
export interface SheetModifier {
  kind: ModifierTarget;
  key: string;
  amount: number;
  /** Stable skill id, present only when duplicate skill names need addressing. */
  skillId?: string;
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
  /** Permanent injury types per location, independent of current HP.
   * Legacy saves store a single string; locationInjuries() accepts both shapes. */
  injuries?: Partial<Record<HitLocation,string[]>>;
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

/** Mythras Core Rules, Special Effects: dismember, crush, impale. */
export const WOUND_TYPES = ['Отсечена','Раздроблена','Пронзена'] as const;

/** Injuries are stored as an array per location; a legacy save may hold one string. */
export function locationInjuries(character: CompanionCharacter, location: HitLocation): string[] {
  const raw: unknown = character.companion?.injuries?.[location];
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string' && value !== '');
  return typeof raw === 'string' && raw ? [raw] : [];
}

export function setLocationInjuries(character: CompanionCharacter, location: HitLocation, types: string[]): void {
  const state = companionState(character);
  const injuries = {...(state.injuries || {})};
  const next = [...new Set(types.filter(Boolean))];
  if (next.length) injuries[location] = next;
  else delete injuries[location];
  state.injuries = injuries;
}

/** Total of magic-statistic modifiers, e.g. theism.poolMax. */
export function magicModifier(character: CompanionCharacter, key: MagicStatKey): number {
  return modifierTotal(character, 'magic', key);
}

export function modifierTotal(character: CompanionCharacter, kind: ModifierTarget, key: string): number {
  return (character.companion?.effects || []).reduce((total, effect) => total +
    (effect.modifiers || []).reduce((subtotal, mod) => subtotal +
      (mod.kind === kind && mod.key === key && Number.isFinite(Number(mod.amount)) ? Number(mod.amount) : 0), 0), 0);
}

/** Skill modifier that respects duplicate names: a modifier with skillId applies
 * to that entry only, a legacy modifier without skillId keeps applying to every
 * skill of the same name. */
export function skillModifierTotal(character: CompanionCharacter, skill: Skill): number {
  return (character.companion?.effects || []).reduce((total, effect) => total +
    (effect.modifiers || []).reduce((subtotal, mod) => {
      if (mod.kind !== 'skill') return subtotal;
      const amount = Number.isFinite(Number(mod.amount)) ? Number(mod.amount) : 0;
      const applies = mod.skillId ? mod.skillId === skill.id : mod.key === skill.name;
      return subtotal + (applies ? amount : 0);
    }, 0), 0);
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
    skillModifierTotal(character,skill) + improvement;
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
  const keys:HitLocation[]=HIT_LOCATION_ORDER;
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
  // Healing stops at the maximum; damage is applied as requested and may go below
  // zero. Clamping damage to a temporarily lowered maximum would heal the character.
  const next=delta>0?Math.min(maxLocationHp(character,location),before+delta):before+delta;
  setCurrentHp(character,location,next);
  return next;
}

/** Return the actual skill object from the canonical character model. That way
 * both the Magic tab and the Skills column use identical difficulty calculations.
 * Prefer a trained exact name; fall back to trained specializations like Devotion (Lanis). */
export function findTraditionSkill(character:CompanionCharacter,name:string):Skill|null {
  const skills=character.skills;
  const list=[...(skills.skills||[]),...(skills.specialized||[]),
    ...(skills.extraProfessionalCultureSkills||[]),...(skills.extraProfessionalCareerSkills||[]),
    ...(skills.hobby?[skills.hobby]:[])].filter((skill):skill is Skill=>Boolean(skill));
  const matching=list.filter(skill=>skill.name===name||skill.name.startsWith(name+' ('));
  // Hydrated characters contain unlearned generic entries as well as trained
  // specializations. A placeholder must not hide Invocation/Devotion (cult).
  const trained=matching.filter(skill=>getSkillTotal(character,skill)>0);
  return trained.find(skill=>skill.name===name)||trained[0]
    ||matching.find(skill=>skill.name===name)||matching[0]||null;
}

/** Legacy Mythras Tools treats each armour location as an equipped slot, no new
 * parallel list of armour pieces is introduced at this stage. */
export function armourPenalty(character: CompanionCharacter): number {
  const raw: unknown = character.equipment?.armorPenalty;
  // An empty string or null in an old save means "no override", not zero.
  if (raw !== undefined && raw !== null && raw !== '') {
    const overridden = Number(raw);
    if (Number.isFinite(overridden)) return overridden;
  }
  // Unlike the legacy getOnlyArmor helper (which halves worn ENC for load),
  // the Armour Penalty uses the FULL ENC of every covered location.
  const keys:HitLocation[]=HIT_LOCATION_ORDER;
  const enc=keys.reduce((sum,loc)=>sum+Math.max(0,Number(character.equipment?.[loc]?.enc)||0),0);
  return Math.ceil(enc/5);
}

export interface MovementSummary {
  walking:number;running:number;sprinting:number;swimming:number;swimSkill:number;horizontalJump:number;verticalJump:number;
  armourPenalty:number;athletics:number;heightMetres:number;
}
/** Reuses Mythras Tools locomotion baselines with the Fatigue table (p.79),
 * full armour initiative penalty (p.58) and running/jumping adjustments (p.70). */
export function movementSummary(character: CompanionCharacter,
  tentative:Partial<Record<CharacteristicKey,number>>={},
  improvements:{athletics?:number;swim?:number}={}): MovementSummary {
  const athletics = character.skills.skills.find(s=>s.name==='Athletics');
  const percent = athletics ? skillTotal(character,athletics,tentative,improvements.athletics||0) : 0;
  const swim=character.skills.skills.find(s=>s.name==='Swim');
  const swimSkill=swim?skillTotal(character,swim,tentative,improvements.swim||0):0;
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
    // Original sheet: movement rate + one metre per full 20% Swim.
    // Use the same fatigue-adjusted baseline as the other movement modes.
    swimming:immobile?0:Math.max(0,walking+Math.floor(swimSkill/20)),
    swimSkill,
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

/** Mythras Sorcery: one shaping point per 10% or fraction in Shaping.
 * Cross-check: Roll20 Mythras v2.7 attr_shaping_points_max uses ceil(total/10).
 * This is a per-spell capacity, not a resource to subtract on casting. */
export function shapingPointMaximum(shaping:number):number {
  return Number.isFinite(shaping)?Math.max(0,Math.ceil(shaping/10)):0;
}

/* ------------------------------------------------------------------ *
 * Skill checks: difficulty grades, Critical Range, Fumble, Augmenting *
 * ------------------------------------------------------------------ */

export type DifficultyMode = 'normal'|'automatic'|'hopeless';
export interface DifficultyStep {
  name: string;
  multiplier: number|null;
  mode: DifficultyMode;
}

/** Mythras Core Rules, Skills, p. 38; ТЗ §6.3. Automatic and Hopeless are not
 * rollable thresholds and must not be rendered as percentages. */
export const DIFFICULTY_STEPS: DifficultyStep[] = [
  {name:'Automatic', multiplier:null, mode:'automatic'},
  {name:'Very Easy', multiplier:2, mode:'normal'},
  {name:'Easy', multiplier:1.5, mode:'normal'},
  {name:'Standard', multiplier:1, mode:'normal'},
  {name:'Hard', multiplier:2/3, mode:'normal'},
  {name:'Formidable', multiplier:.5, mode:'normal'},
  {name:'Herculean', multiplier:.1, mode:'normal'},
  {name:'Hopeless', multiplier:null, mode:'hopeless'},
];

/** ТЗ §3, §6.2: 20% of the augmenting skill, rounded up. Locale 33% → +7.
 * Not `2 * critical range`, which would give +8 for the book's own example. */
export function augmentingBonus(value:number):number {
  return Number.isFinite(value) ? Math.max(0, Math.ceil(value*0.2)) : 0;
}

export interface CheckThresholds {
  mode: DifficultyMode;
  /** Ordinary success threshold, or null when no roll is possible. */
  ordinary: number|null;
  /** Critical range after the difficulty grade, never increased by augmentation. */
  critical: number|null;
  /** Lowest fumble result: 99 (fumble on 99–00) or 100 (only 00). */
  fumbleFrom: number|null;
}

/** ТЗ §6.3–6.4. Order: augment the ordinary chance, then apply the difficulty;
 * Critical and Fumble use the skill without the augmentation bonus. Values are
 * never capped at 100 because Mythras allows skills above 100%. */
export function checkThresholds(primary:number, step:DifficultyStep, augmentingSkillValue=0):CheckThresholds {
  if (step.mode !== 'normal' || step.multiplier === null) {
    return {mode:step.mode, ordinary:null, critical:null, fumbleFrom:null};
  }
  const base = Number.isFinite(primary) ? Math.max(0, primary) : 0;
  const augmented = base + augmentingBonus(augmentingSkillValue);
  const afterDifficulty = base * step.multiplier;
  return {
    mode:'normal',
    ordinary: Math.ceil(augmented * step.multiplier),
    critical: Math.ceil(afterDifficulty / 10),
    fumbleFrom: afterDifficulty > 100 ? 100 : 99,
  };
}

export function difficultyStep(name:string):DifficultyStep {
  return DIFFICULTY_STEPS.find(step => step.name === name) || DIFFICULTY_STEPS[2];
}

/* ------------------------------------------------------ *
 * Magic disciplines: computed parameters (ТЗ §8, §9)      *
 * ------------------------------------------------------ */

export const THEIST_RANKS = ['Lay Member','Initiate','Acolyte','Priest','High Priest'] as const;

/** ТЗ §8.2: maximum Devotion Pool by rank. Fractions are rounded up (§3). */
export function devotionPoolCapacity(rank:string, pow:number):number {
  const value = Math.max(0, Number(pow) || 0);
  switch (rank) {
    case 'Initiate': return Math.ceil(value/4);
    case 'Acolyte': return Math.ceil(value/2);
    case 'Priest': return Math.ceil(3*value/4);
    case 'High Priest': return value;
    default: return 0; // Lay Member and unknown ranks have no pool.
  }
}

/** ТЗ §8.1: the sum of all theistic pools is limited by POW. With one pool the
 * limit is min(capacity, POW); kept as a helper so multiple cults can reuse it. */
export function theismPoolLimit(rank:string, pow:number):number {
  const capacity = devotionPoolCapacity(rank, pow);
  return Math.max(0, Math.min(capacity, Math.max(0, Number(pow) || 0)));
}

/** ТЗ §8.3, §9.5: Intensity = Magnitude = ceil(Devotion / 10). */
export function theismIntensity(devotion:number):number {
  return Number.isFinite(devotion) ? Math.max(0, Math.ceil(devotion/10)) : 0;
}

/** ТЗ §9.2: max spirit POW = three Critical Ranges of Binding. */
export function animismMaxSpiritPow(binding:number):number {
  return Number.isFinite(binding) ? Math.max(0, 3*Math.ceil(binding/10)) : 0;
}

/** ТЗ §9.2: bound spirits by rank and CHA. Spirit Lord is treated as High Shaman
 * (the book table has no Spirit Lord entry); the rank itself is preserved. */
export function animismSpiritLimit(rank:string, cha:number):number|null {
  const value = Math.max(0, Number(cha) || 0);
  switch (rank) {
    case 'Follower': return Math.ceil(value/4);
    case 'Spirit Worshipper': return Math.ceil(value/2);
    case 'Shaman': return Math.ceil(3*value/4);
    case 'High Shaman': return value;
    case 'Spirit Lord': return value;
    default: return null; // No rank selected: do not invent a limit.
  }
}

/** ТЗ §9.2: Spirit Damage by Binding. Above 300% the book table continues, but the
 * continuation is not specified here, so the result is null rather than invented. */
export function animismSpiritDamage(binding:number):string|null {
  if (!Number.isFinite(binding) || binding < 1) return null;
  if (binding <= 20) return '1d2';
  if (binding <= 40) return '1d4';
  if (binding <= 60) return '1d6';
  if (binding <= 80) return '1d8';
  if (binding <= 100) return '1d10';
  if (binding <= 120) return '2d6';
  if (binding <= 140) return '1d8 + 1d6';
  if (binding <= 160) return '2d8';
  if (binding <= 180) return '1d10 + 1d8';
  if (binding <= 200) return '2d10';
  if (binding <= 220) return '2d10 + 1d2';
  if (binding <= 240) return '2d10 + 1d4';
  if (binding <= 260) return '2d10 + 1d6';
  if (binding <= 280) return '2d10 + 1d8';
  if (binding <= 300) return '3d10';
  return null;
}

/** ТЗ §9.2: Spirit Intensity from the spirit's own POW, not the animist's skill. */
export function spiritIntensity(pow:number):number|null {
  if (!Number.isFinite(pow) || pow < 1) return null;
  return pow <= 6 ? 0 : Math.ceil((pow-6)/6);
}

/** ТЗ §9.3: total Intensity budget of active talents, limited by Meditation. */
export function mysticismTotalIntensity(meditation:number):number {
  return Number.isFinite(meditation) ? Math.max(0, Math.ceil(meditation/10)) : 0;
}

/** ТЗ §9.3: maximum Intensity of a single talent of that path. */
export function mysticismTalentIntensity(mysticism:number):number {
  return Number.isFinite(mysticism) ? Math.max(0, Math.ceil(mysticism/20)) : 0;
}

/** ТЗ §9.3: talents trained at once, all paths together. */
export function mysticismTrainedLimit(pow:number):number {
  return Number.isFinite(pow) ? Math.max(0, Math.ceil(pow/2)) : 0;
}

/** ТЗ §9.4: Intensity = ceil(Invocation / 10). */
export function sorceryIntensity(invocation:number):number {
  return Number.isFinite(invocation) ? Math.max(0, Math.ceil(invocation/10)) : 0;
}

/** ТЗ §9.4: spells held in memory are limited by INT. */
export function sorceryMemoryLimit(intelligence:number):number {
  return Number.isFinite(intelligence) ? Math.max(0, Math.floor(intelligence)) : 0;
}

/** ТЗ §9.1: starting Folk Magic spells, one per 20% or fraction. Reference only:
 * starting selections are not validated yet (see design/COMPANION-OPEN-QUESTIONS.md). */
export function folkMagicStartingSpells(folkMagic:number):number {
  return Number.isFinite(folkMagic) ? Math.max(0, Math.ceil(folkMagic/20)) : 0;
}
