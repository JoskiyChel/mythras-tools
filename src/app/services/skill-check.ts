/** Resolution of a d100 skill check against the thresholds from
 * `companion-sheet.ts`. The roll is always 1–100; automatic and hopeless
 * checks do not need a die and are exposed for the UI as informational modes.
 */

import {CheckThresholds} from './companion-sheet';

export type CheckOutcome = 'automatic' | 'hopeless' | 'critical' | 'success' | 'failure' | 'fumble';

export interface SkillCheckResult {
  roll: number | null;
  outcome: CheckOutcome;
  label: string;
  /** A compact, player-facing explanation of why this outcome was chosen. */
  explanation: string;
  target: CheckThresholds;
}

export const CHECK_OUTCOME_LABELS: Record<CheckOutcome, string> = {
  automatic: 'Автоматический успех',
  hopeless: 'Проверка невозможна',
  critical: 'Критический успех',
  success: 'Успех',
  failure: 'Провал',
  fumble: 'Фамбл',
};

/** Validate a physical d100 result before resolving it. */
export function normalizeD100(value: number): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
    throw new Error('Результат d100 должен быть целым числом от 1 до 100.');
  }
  return numeric;
}

/**
 * Resolve a roll using Mythras Core Rules, Skills, pp. 37–38:
 * - 01–05 are always a success;
 * - 96–00 are always a failure;
 * - Critical and Fumble ranges are computed without the augment bonus;
 * - above 100% only 00 is a fumble, while 96–99 remain ordinary failures.
 */
export function resolveSkillCheck(roll: number, target: CheckThresholds): SkillCheckResult {
  if (target.mode === 'automatic') {
    return {
      roll: null,
      outcome: 'automatic',
      label: CHECK_OUTCOME_LABELS.automatic,
      explanation: 'Сложность Automatic: бросок не требуется.',
      target,
    };
  }
  if (target.mode === 'hopeless') {
    return {
      roll: null,
      outcome: 'hopeless',
      label: CHECK_OUTCOME_LABELS.hopeless,
      explanation: 'Сложность Hopeless: проверка невозможна.',
      target,
    };
  }

  const result = normalizeD100(roll);
  const ordinary = target.ordinary ?? 0;
  const critical = target.critical ?? 0;
  const fumbleFrom = target.fumbleFrom ?? 100;

  if (result >= 96) {
    const fumble = result >= fumbleFrom;
    return {
      roll: result,
      outcome: fumble ? 'fumble' : 'failure',
      label: CHECK_OUTCOME_LABELS[fumble ? 'fumble' : 'failure'],
      explanation: fumble
        ? `Бросок ${result}: 96–00 всегда провал, для этого порога фамбл начинается с ${fumbleFrom}.`
        : `Бросок ${result}: 96–00 всегда провал.`,
      target,
    };
  }

  if (result <= critical) {
    return {
      roll: result,
      outcome: 'critical',
      label: CHECK_OUTCOME_LABELS.critical,
      explanation: `Бросок ${result} попадает в Critical Range ≤ ${critical}.`,
      target,
    };
  }

  if (result <= ordinary || result <= 5) {
    return {
      roll: result,
      outcome: 'success',
      label: CHECK_OUTCOME_LABELS.success,
      explanation: result <= ordinary
        ? `Бросок ${result} не превышает порог ${ordinary}.`
        : `Бросок ${result}: 01–05 всегда успех.`,
      target,
    };
  }

  return {
    roll: result,
    outcome: 'failure',
    label: CHECK_OUTCOME_LABELS.failure,
    explanation: `Бросок ${result} выше порога ${ordinary}, но ниже фамбла ${fumbleFrom}.`,
    target,
  };
}

/** Convenience for the UI: resolve a fresh physical or virtual d100. */
export function checkWithRoll(target: CheckThresholds, roll: number): SkillCheckResult {
  return resolveSkillCheck(roll, target);
}
