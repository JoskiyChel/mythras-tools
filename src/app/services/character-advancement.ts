import type { Character } from '../model/character';
import type { Skill } from '../model/skill';
import { CHARACTERISTICS, CharacteristicKey, CompanionCharacter, checkThresholds, difficultyStep } from './companion-sheet';
import type { SkillAddress, SkillTraining } from '../model/character-advancement';
import { getSkillTotal } from './character-service.service';
import { resultFromValues, rollDice } from './dice';
import { resolveSkillCheck } from './skill-check';

// Rules and training flow adapted from xe-n0x/mythras-tools (dev, 4b8e741).
const skillCollections = ['skills', 'specialized', 'combatstyles', 'extraProfessionalCultureSkills', 'extraProfessionalCareerSkills'] as const;

export function advancementSkills(character: Character): { address: SkillAddress; skill: Skill; learned: boolean }[] {
  const seen = new Set<Skill>();
  const groups = skillCollections.map(collection => ({ collection, entries: character.skills[collection] }));
  return [...groups, { collection: 'hobby' as const, entries: [character.skills.hobby] }].flatMap(({ collection, entries }) =>
    entries.flatMap((skill, index) => {
      if (!skill || seen.has(skill)) return [];
      seen.add(skill);
      const selected = character.skills.hobby === skill || character.skills.extraProfessionalCultureSkills.includes(skill) ||
        character.skills.extraProfessionalCareerSkills.includes(skill);
      const learned = !skill.professional || !!(skill.force || skill.cultureBonus || skill.careerBonus || skill.extraBonus || selected);
      return [{ skill, address: { collection, index, name: skill.name }, learned }];
    }));
}

export function advancementSkill(character: Character, address: SkillAddress): Skill | undefined {
  const skill = address.collection === 'hobby' ? character.skills.hobby : character.skills[address.collection]?.[address.index];
  return skill?.name === address.name ? skill : undefined;
}

export function experienceBalance(character: Character): number {
  const balance = character.advancement?.experienceRolls;
  return Number.isSafeInteger(balance) && balance! >= 0 ? balance! : 0;
}

export function validExperienceBalance(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Increasing Existing Skills and Increasing Passions, Core Rules p. 72. */
export function experienceImprovement(score: number, intelligence: number, percentile: number, d4?: number): number | undefined {
  if (!Number.isFinite(score) || !Number.isFinite(intelligence) || !Number.isInteger(percentile) || percentile < 1 || percentile > 100) return;
  if (percentile + intelligence < score) return 1;
  if (Number.isInteger(d4) && d4! >= 1 && d4! <= 4) return d4! + 1;
  return undefined;
}

/** Training Improvement Table, Core Rules p. 73. The campaign includes 20 pp in the first row. */
export function trainingExpression(difference: number, shift = 0): string | undefined {
  if (!Number.isSafeInteger(difference) || difference < 20 || !Number.isInteger(shift) || shift < -1 || shift > 2) return;
  const step = Math.max(0, Math.ceil((difference - 30) / 10)) + shift;
  if (step < 0) return '0';
  if (step < 4) return ['d2', 'd3', 'd4', 'd6'][step];
  return 'd6+' + (step - 3);
}

/** Training, Core Rules p. 73. Coin costs are a guide; other terms depend on the GM. */
export function trainingPrice(mentorSkill: number, teach = 0): number {
  return Math.floor(mentorSkill / 5) + Math.floor(teach / 10);
}

export function trainingShift(teach: number, percentile: number): number | undefined {
  // Teachers, p. 73; grades of success, pp. 37–38.
  if (!Number.isInteger(percentile) || percentile < 1 || percentile > 100) return;
  const result = resolveSkillCheck(percentile, checkThresholds(teach, difficultyStep('Standard')));
  switch (result.outcome) {
    case 'critical': return 2;
    case 'success': return 1;
    case 'failure': return 0;
    case 'fumble': return -1;
    default: return undefined;
  }
}

export function advancementRoll(expression: string, manual: string): number | undefined {
  try {
    return manual.trim()
      ? resultFromValues(expression, [Number(manual)]).total
      : rollDice(expression).total;
  } catch {
    return undefined;
  }
}

/** Increasing Characteristics, Core Rules p. 72. Tennla rounds new steps down. */
export function characteristicTrainingStep(maximum: number): number {
  return Math.floor(maximum / 10);
}

/** Optional Permanent Characteristic Improvement, Core Rules p. 73. */
export function permanentCharacteristicCost(current: number, minimum: number): number {
  return 1 + current - minimum;
}

export type AdvancementAction =
  | { kind: 'balance'; delta: number }
  | { kind: 'award'; rolls: number; modifier: number }
  | { kind: 'experience'; skill: SkillAddress; d100: number; d4?: number }
  | { kind: 'passion'; index: number; d100: number; d4?: number; reduce?: boolean }
  | { kind: 'fumble'; skill: SkillAddress }
  | { kind: 'learn'; skill: SkillAddress; source: string; month: string }
  | { kind: 'startTraining'; training: SkillTraining }
  | { kind: 'cancelTraining' }
  | { kind: 'finishTraining'; week: string; teachRoll?: number; die?: number }
  | { kind: 'regime'; key: CharacteristicKey; steps: number; maximum: number }
  | { kind: 'permanent'; key: CharacteristicKey; minimum: number; maximum: number }
  | { kind: 'magic'; tradition: 'folk' | 'sorcery' | 'miracles' | 'augmentations' | 'invocations' | 'enhancements';
      name: string; description: string; rolls: number; study: string };

export interface AdvancementEntry {
  action: AdvancementAction;
  description: string;
}

export function balanceAdjustment(delta: number): AdvancementEntry {
  return {
    action: {kind: 'balance', delta},
    description: 'Корректировка остатка · ' + (delta > 0 ? '+' : '') + delta,
  };
}

const whole = validExperienceBalance;
const fail = (message: string): never => { throw new Error(message); };

export function applyAdvancement(character: CompanionCharacter, actions: readonly AdvancementAction[]): CompanionCharacter {
  const copy = structuredClone(character);
  for (const action of actions) applyAction(copy, action);
  return copy;
}

function applyAction(character: CompanionCharacter, action: AdvancementAction): void {
  const data = character.advancement ??= {};
  const skillEntry = (address: SkillAddress, learned = true) => {
    const entry = advancementSkills(character).find(option => option.skill === advancementSkill(character, address));
    if (!entry || entry.learned !== learned || !entry.skill.base.every(key => !key || Number.isFinite(Number(character.skills[key as CharacteristicKey])))) {
      return fail('Выберите подходящий навык с известными базовыми характеристиками.');
    }
    return entry.skill;
  };
  const spend = (rolls: number) => {
    if (!whole(rolls) || experienceBalance(character) < rolls) fail('Недостаточно Experience Rolls.');
    data.experienceRolls = experienceBalance(character) - rolls;
  };
  const increase = (skill: Skill, amount: number) => {
    const bonus = (Number(skill.extraBonus) || 0) + amount;
    if (!Number.isSafeInteger(bonus)) fail('Итоговая поправка выходит за числовой диапазон.');
    skill.extraBonus = bonus;
  };
  const training = data.training;
  const sameTraining = (skill: Skill) => !!training && advancementSkill(character, training.skill) === skill;
  switch (action.kind) {
    case 'balance': {
      const next = experienceBalance(character) + action.delta;
      if (!Number.isSafeInteger(action.delta) || !whole(next)) fail('Укажите целое число бросков от 0.');
      data.experienceRolls = next;
      break;
    }
    case 'award': {
      if (!whole(action.rolls) || action.rolls === 0 || !Number.isSafeInteger(action.modifier)) fail('Проверьте награду и модификатор.');
      const net = action.rolls + action.modifier;
      // Core Rules p. 72: reduce regular awards while maintaining a characteristic.
      const regimes = Object.entries(data.regimes || {}) as [CharacteristicKey, NonNullable<NonNullable<Character['advancement']>['regimes']>[CharacteristicKey]][];
      const upkeep = regimes.reduce((sum, [, regime]) => sum + (regime?.target ?? regime?.steps ?? 0), 0);
      const remaining = net - upkeep;
      if (!whole(remaining) || !whole(experienceBalance(character) + remaining)) fail('Награда не покрывает содержание выбранных режимов.');
      data.experienceRolls = experienceBalance(character) + remaining;
      for (const [key, regime] of regimes) {
        if (!regime || regime.target === undefined || regime.steps <= regime.target) continue;
        changeCharacteristic(character, key, -regime.step);
        regime.steps--;
        if (!regime.steps) delete data.regimes![key];
        else if (regime.steps === regime.target) delete regime.target;
      }
      for (const { skill } of advancementSkills(character)) delete skill.fumbleImprovementClaimed;
      data.fumbleCredit = true;
      break;
    }
    case 'experience':
    case 'passion': {
      const skill = action.kind === 'experience' ? skillEntry(action.skill) : undefined;
      const passion = action.kind === 'passion' ? character.passions[action.index] : undefined;
      const score = skill ? getSkillTotal(character, skill) : passion?.passion?.trim() ? passion.modifierNumber : undefined;
      if (!Number.isFinite(score) || !Number.isFinite(Number(character.skills.int))) fail('Нужны записанные постоянные значения и ИНТ.');
      if (skill && sameTraining(skill)) fail('Сначала завершите или отмените тренировку этого навыка.');
      const amount = experienceImprovement(score!, Number(character.skills.int), action.d100, action.d4);
      if (amount === undefined) return fail('Нужны допустимые результаты d100 и d4, если он требуется.');
      if (action.kind === 'passion' && action.reduce && score! < amount) fail('Согласуйте уменьшение страсти с ведущим.');
      spend(1);
      if (skill) {
        increase(skill, amount);
        delete skill.trainedSinceExperience;
      } else if (passion) passion.modifierNumber = score! + (action.kind === 'passion' && action.reduce ? -amount : amount);
      break;
    }
    case 'fumble': {
      const skill = skillEntry(action.skill);
      if (!data.fumbleCredit || skill.fumbleImprovementClaimed || sameTraining(skill)) fail('Прибавка за критический провал сейчас недоступна.');
      increase(skill, 1);
      skill.fumbleImprovementClaimed = true;
      break;
    }
    case 'learn': {
      const skill = skillEntry(action.skill, false);
      if (!skill.professional || !action.source.trim() || !action.month.trim()) fail('Укажите источник обучения и завершённый месяц практики.');
      spend(3);
      skill.force = true;
      break;
    }
    case 'startTraining': {
      const plan = action.training;
      const skill = skillEntry(plan.skill);
      if (training || skill.trainedSinceExperience || !plan.mentor.trim() || !plan.period.trim() || !plan.terms.trim() ||
        !whole(plan.mentorSkill) || plan.teach !== undefined && (!whole(plan.teach) || plan.teach === 0) ||
        !trainingExpression(plan.mentorSkill - getSkillTotal(character, skill))) {
        fail('Проверьте наставника, период, условия и преимущество навыка. Повторная тренировка требует повышения за Experience Roll.');
      }
      data.training = { ...plan };
      break;
    }
    case 'cancelTraining':
      if (!training) fail('Нет начатой тренировки.');
      delete data.training;
      break;
    case 'finishTraining': {
      if (!training || !action.week.trim()) return fail('Подтвердите завершение полной игровой недели.');
      const skill = skillEntry(training.skill);
      const shift = training.teach === undefined ? 0 : trainingShift(training.teach, action.teachRoll ?? 0);
      const expression = shift === undefined ? undefined : trainingExpression(training.mentorSkill - getSkillTotal(character, skill), shift);
      const amount = expression === '0' ? 0 : expression && advancementRoll(expression, String(action.die ?? '—'));
      if (typeof amount !== 'number') return fail('Проверьте результат Teach и кубик обучения.');
      if (amount) increase(skill, amount);
      skill.trainedSinceExperience = true;
      delete data.training;
      break;
    }
    case 'regime': {
      const value = Number(character.skills[action.key]);
      data.regimes ??= {};
      const previous = data.regimes[action.key];
      const step = previous?.step ?? characteristicTrainingStep(action.maximum);
      const oldSteps = previous?.steps ?? 0;
      const natural = value - oldSteps * (previous?.step ?? 0);
      const next = natural + step * action.steps;
      if (action.key === 'siz' || !whole(action.steps) || !whole(value) || !whole(action.maximum) || !whole(natural) ||
        step < 1 || next > action.maximum || previous && previous.maximum !== action.maximum ||
        action.steps === oldSteps && previous?.target === undefined) {
        fail('Проверьте максимум вида и число ступеней. Обычный режим не применяется к SIZ.');
      }
      if (action.steps < oldSteps) {
        // A stopped step atrophies at the next award, one step per award.
        data.regimes[action.key] = { steps: oldSteps, step, maximum: action.maximum, target: action.steps };
      } else {
        changeCharacteristic(character, action.key, next - value);
        if (action.steps) data.regimes[action.key] = { steps: action.steps, step, maximum: action.maximum };
        else delete data.regimes[action.key];
      }
      break;
    }
    case 'permanent': {
      const value = Number(character.skills[action.key]);
      if (action.key === 'siz' || data.regimes?.[action.key] || !whole(action.minimum) ||
        !whole(action.maximum) || !whole(value) || value < action.minimum || value >= action.maximum) {
        fail('Проверьте границы вида и используемое опциональное правило.');
      }
      spend(permanentCharacteristicCost(value, action.minimum));
      changeCharacteristic(character, action.key, 1);
      break;
    }
    case 'magic': {
      if (!action.name.trim() || !action.study.trim() || !whole(action.rolls) || action.rolls === 0) fail('Нужны условия изучения и расход, согласованные с ведущим.');
      const name = action.name.trim();
      if (action.tradition === 'augmentations') {
        if (character.magic.path.augmentations.some(entry => entry.toLowerCase() === name.toLowerCase())) fail('Способность уже записана.');
        spend(action.rolls);
        character.magic.path.augmentations.push(name);
        break;
      }
      const destination = action.tradition === 'folk' || action.tradition === 'sorcery' || action.tradition === 'miracles'
        ? character.magic[action.tradition] : character.magic.path[action.tradition];
      if (destination.some(entry => entry.name?.toLowerCase() === name.toLowerCase())) fail('Способность уже записана.');
      spend(action.rolls);
      destination.push({ name, description: action.description.trim() });
      break;
    }
  }
}

/** Apply a permanent increase to both the base and any recorded current value. */
export function changeCharacteristic(character: CompanionCharacter, key: CharacteristicKey, delta: number): void {
  if (!delta) return;
  character.skills[key] = (Number(character.skills[key]) || 0) + delta;
  const current = character.currentValues?.[key];
  if (current !== '' && current != null && Number.isFinite(Number(current))) {
    character.currentValues![key] = Number(current) + delta;
  }
}

/** Commit a validated copy while keeping the original shared skill objects. */
export function commitAdvancement(character: CompanionCharacter, projected: CompanionCharacter): void {
  for (const key of CHARACTERISTICS) character.skills[key] = projected.skills[key];
  if (projected.currentValues) character.currentValues = projected.currentValues;
  for (const {address, skill} of advancementSkills(character)) {
    const next = advancementSkill(projected, address);
    if (!next) continue;
    Object.assign(skill, next);
    if (!next.trainedSinceExperience) delete skill.trainedSinceExperience;
    if (!next.fumbleImprovementClaimed) delete skill.fumbleImprovementClaimed;
  }
  character.advancement = projected.advancement;
  character.passions = projected.passions;
  Object.assign(character.magic, projected.magic);
}
