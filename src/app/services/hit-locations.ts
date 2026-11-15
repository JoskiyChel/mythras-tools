/**
 * Single source of truth for hit locations: order, d20 range and labels.
 * The sheet's body diagram, the armour list and the legacy viewer all read the
 * same order, so a change here is a change everywhere.
 *
 * Mythras Core Rules, p. 15; ТЗ §5.1: order is top-down as printed on the sheet.
 * Keys are part of the save format (`abdoment` is the legacy spelling) and must
 * never be renamed.
 */
export const HIT_LOCATION_KEYS = [
  'head', 'leftArm', 'rightArm', 'chest', 'abdoment', 'leftLeg', 'rightLeg',
] as const;

export type HitLocation = typeof HIT_LOCATION_KEYS[number];

export interface HitLocationRule {
  key: HitLocation;
  labelRu: string;
  labelEn: string;
  rollMin: number;
  rollMax: number;
  /** Displayed range, e.g. `19–20`. */
  roll: string;
}

export const HIT_LOCATION_RULES: HitLocationRule[] = [
  {key:'head', labelRu:'Голова', labelEn:'Head', rollMin:19, rollMax:20, roll:'19–20'},
  {key:'leftArm', labelRu:'Левая рука', labelEn:'Left arm', rollMin:16, rollMax:18, roll:'16–18'},
  {key:'rightArm', labelRu:'Правая рука', labelEn:'Right arm', rollMin:13, rollMax:15, roll:'13–15'},
  {key:'chest', labelRu:'Грудь', labelEn:'Chest', rollMin:10, rollMax:12, roll:'10–12'},
  {key:'abdoment', labelRu:'Живот', labelEn:'Abdomen', rollMin:7, rollMax:9, roll:'7–9'},
  {key:'leftLeg', labelRu:'Левая нога', labelEn:'Left leg', rollMin:4, rollMax:6, roll:'4–6'},
  {key:'rightLeg', labelRu:'Правая нога', labelEn:'Right leg', rollMin:1, rollMax:3, roll:'1–3'},
];

export const HIT_LOCATION_ORDER: HitLocation[] = HIT_LOCATION_RULES.map(rule => rule.key);

export function hitLocationRule(key: HitLocation): HitLocationRule {
  return HIT_LOCATION_RULES.find(rule => rule.key === key) || HIT_LOCATION_RULES[0];
}

/** 1d20 result to location; returns null for results outside 1–20. */
export function hitLocationForRoll(roll: number): HitLocation | null {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) return null;
  return HIT_LOCATION_RULES.find(rule => roll >= rule.rollMin && roll <= rule.rollMax)?.key || null;
}
