import { Character } from '../model/character';
import { Skill } from '../model/skill';
import { getSkillTotal } from './character-service.service';
import { HIT_LOCATION_RULES, HitLocation } from './hit-locations';

export type { HitLocation };

/** Same order as the sheet (ТЗ §5.1); English labels are kept for the legacy viewer. */
export const HIT_LOCATIONS: {key: HitLocation; label: string}[] =
  HIT_LOCATION_RULES.map(rule => ({key: rule.key, label: rule.labelEn}));

export function getCurrentHp(character: Character, location: HitLocation): number | string {
  return character.currentHitPoints?.[location] ?? '';
}

export function setCurrentHp(character: Character, location: HitLocation, value: string | number | null | undefined): void {
  const parsed = value == null || value === '' ? '' : Number(value);
  (character.currentHitPoints ||= {})[location] = parsed === '' || Number.isFinite(parsed) ? parsed : '';
}

export function getMaximumHp(character: Character, location: HitLocation): number {
  // Earlier sheets stored manual current HP as extraBonus; it is not part of maximum HP.
  return getSkillTotal(character, {...character.hp[location], extraBonus:0} as Skill);
}

export function restoreLegacyCurrentHp(character: Character): void {
  const currentStats = (character as any).currentValues || {};
  const calculation = {...character, skills:{...character.skills}} as Character;
  for (const stat of ['con','siz'] as const) {
    const value = currentStats[stat];
    if (value !== '' && value != null && Number.isFinite(Number(value))) calculation.skills[stat] = Number(value);
  }
  for (const {key} of HIT_LOCATIONS) {
    if (Object.prototype.hasOwnProperty.call(character.currentHitPoints || {}, key)) continue;
    const oldValue: unknown = character.hp[key].extraBonus;
    // Reading/calculating HP never wrote this field; its presence records an old manual edit.
    if (oldValue != null && oldValue !== '' && Number.isFinite(Number(oldValue))) {
      setCurrentHp(character, key, getSkillTotal(calculation, character.hp[key]));
    }
  }
}
