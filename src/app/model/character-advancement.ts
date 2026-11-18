import type { CharacteristicKey } from '../services/companion-sheet';

export type SkillAddress = { collection: 'skills' | 'specialized' | 'combatstyles' | 'extraProfessionalCultureSkills' | 'extraProfessionalCareerSkills' | 'hobby'; index: number; name: string };

export interface SkillTraining {
  skill: SkillAddress;
  mentor: string;
  mentorSkill: number;
  teach?: number;
  period: string;
  terms: string;
}

export interface CharacterAdvancement {
  experienceRolls?: number;
  fumbleCredit?: boolean;
  training?: SkillTraining;
  regimes?: Partial<Record<CharacteristicKey, { steps: number; step: number; maximum: number; target?: number }>>;
}
