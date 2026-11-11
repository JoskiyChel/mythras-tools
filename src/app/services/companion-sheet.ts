import { Character } from '../model/character';
import { Skill } from '../model/skill';
import { getDamageModifier, getOnlyArmor, getSkillTotal } from './character-service.service';
import { getMaximumHp, HitLocation } from './hit-points';

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
export const FATIGUE = ['Fresh','Winded','Tired','Wearied','Exhausted','Debilitated','Incapacitated','Semi-Conscious','Comatose','Dead'];

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
  return getSkillTotal(calculationCharacter(character,tentative),attribute) + modifierTotal(character,'attribute',key);
}

/** Damage Modifier is dice notation, not a scalar. A flat bonus is displayed separately. */
export function damageModifier(character: CompanionCharacter,
  tentative: Partial<Record<CharacteristicKey,number>> = {}): string {
  const base = getDamageModifier(calculationCharacter(character,tentative));
  const bonus = modifierTotal(character,'attribute','damage');
  return bonus ? `${base} (${bonus > 0 ? '+' : ''}${bonus} flat)` : base;
}

export function movement(character: CompanionCharacter): number {
  return Math.max(0,(Number(character.movementRate) || 0) + modifierTotal(character,'attribute','movement'));
}

export function magicPointMaximum(character: CompanionCharacter,
  tentative: Partial<Record<CharacteristicKey,number>> = {}): number {
  return Math.max(0,currentCharacteristic(character,'pow',tentative) + modifierTotal(character,'attribute','magicPoints'));
}

export function maxLocationHp(character: CompanionCharacter, location: HitLocation,
  tentative: Partial<Record<CharacteristicKey,number>> = {}): number {
  return getMaximumHp(calculationCharacter(character,tentative),location);
}

/** Legacy Mythras Tools treats each armour location as an equipped slot, no new
 * parallel list of armour pieces is introduced at this stage. */
export function armourPenalty(character: CompanionCharacter): number {
  const overridden = Number(character.equipment?.armorPenalty);
  if (character.equipment?.armorPenalty !== undefined && Number.isFinite(overridden)) return overridden;
  return Math.ceil(getOnlyArmor(character,'enc')/5);
}

export interface MovementSummary {
  walking:number;running:number;sprinting:number;horizontalJump:number;verticalJump:number;
  armourPenalty:number;athletics:number;heightMetres:number;
}
/** Reuses the current Mythras Tools viewer formulas as a compatibility baseline.
 * Penalties and specialised movement rules need a separate rules-validation pass. */
export function movementSummary(character: CompanionCharacter): MovementSummary {
  const athletics = character.skills.skills.find(s=>s.name==='Athletics');
  const percent = athletics ? skillTotal(character,athletics) : 0;
  const walking = movement(character);
  const bonus = Math.floor(percent/25) * 0.5;
  const jumpBonus = Math.floor(percent/20);
  const h = Number(character.height) || 0;
  const heightMetres = h < 10 ? h : h/100;
  const penalty=armourPenalty(character);
  return {
    walking,
    running:Math.max(0,(walking+bonus)*3-penalty),
    sprinting:Math.max(0,(walking+bonus)*5-penalty),
    horizontalJump:Math.max(0,heightMetres*2+jumpBonus-penalty),
    verticalJump:Math.max(0,heightMetres*2+jumpBonus*0.2-penalty),
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
