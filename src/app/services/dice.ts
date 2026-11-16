/** Dice expressions and dice-result helpers for the table-side loop.
 *
 * Supported syntax: `2d6 + 1d8 - 3`, `d100`, `1d8+1d6−2` (Unicode minus is
 * normalised). Each term is a number of dice with 2–100 sides; a bare number is
 * a flat modifier. Values are never capped: Mythras allows skills above 100%.
 */

export const DICE_MIN_SIDES = 2;
export const DICE_MAX_SIDES = 100;
export const DICE_MIN_COUNT = 1;
export const DICE_MAX_COUNT = 50;
export const DICE_MAX_TOTAL = 100;

export interface DiceTerm {
  count: number;
  sides: number;
}

export interface ParsedDiceExpression {
  terms: DiceTerm[];
  modifier: number;
  normalized: string;
}

export type DiceRandom = (sides: number) => number;

export interface DiceTermRoll {
  term: DiceTerm;
  values: number[];
}

export interface DiceRollResult {
  expression: string;
  normalized: string;
  terms: DiceTermRoll[];
  modifier: number;
  total: number;
  dieCount: number;
}

/** Normalise user whitespace and the minus signs copied from rulebooks. */
export function normalizeDiceExpression(expression: string): string {
  return String(expression ?? '')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
}

const DICE_TOKEN = /^([+-]?)(?:(\d{1,3})?d(\d{1,3})|(\d{1,4}))/;

/** Parse one expression without rolling. Throws a human-readable Error. */
export function parseDiceExpression(expression: string): ParsedDiceExpression {
  const source = normalizeDiceExpression(expression);
  if (!source) throw new Error('Введите формулу кубика, например 1d100.');

  const terms: DiceTerm[] = [];
  let modifier = 0;
  let rest = source;
  let first = true;

  while (rest) {
    const match = DICE_TOKEN.exec(rest);
    if (!match) throw new Error(`Не удалось разобрать формулу: «${expression}».`);

    const signText = match[1];
    if (!first && !signText) throw new Error('Между слагаемыми нужен знак + или −.');
    if (first && signText === '-') throw new Error('Формула не может начинаться с минуса.');

    const sign = signText === '-' ? -1 : 1;
    const dicePart = match[3] !== undefined;
    if (dicePart) {
      const count = match[2] === undefined ? 1 : Number(match[2]);
      const sides = Number(match[3]);
      validateDiceTerm(count, sides);
      terms.push({ count, sides });
    } else {
      modifier += sign * Number(match[4]);
    }

    rest = rest.slice(match[0].length);
    first = false;
  }

  if (!terms.length) throw new Error('В формуле должен быть хотя бы один кубик.');
  const dieCount = terms.reduce((sum, term) => sum + term.count, 0);
  if (dieCount > DICE_MAX_TOTAL) {
    throw new Error(`Слишком много кубиков: максимум ${DICE_MAX_TOTAL}.`);
  }

  return { terms, modifier, normalized: normalizedExpression(terms, modifier) };
}

function validateDiceTerm(count: number, sides: number): void {
  if (!Number.isInteger(count) || count < DICE_MIN_COUNT || count > DICE_MAX_COUNT) {
    throw new Error(`Количество кубиков должно быть от ${DICE_MIN_COUNT} до ${DICE_MAX_COUNT}.`);
  }
  if (!Number.isInteger(sides) || sides < DICE_MIN_SIDES || sides > DICE_MAX_SIDES) {
    throw new Error(`Грани кубика должны быть от ${DICE_MIN_SIDES} до ${DICE_MAX_SIDES}.`);
  }
}

function normalizedExpression(terms: DiceTerm[], modifier: number): string {
  const dice = terms.map(term => `${term.count}d${term.sides}`).join('+');
  if (!modifier) return dice;
  return `${dice}${modifier > 0 ? '+' : '-'}${Math.abs(modifier)}`;
}

/** Cryptographically strong die using rejection sampling (no modulo bias). */
export function secureDie(sides: number): number {
  validateDiceTerm(1, sides);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    return Math.floor(Math.random() * sides) + 1;
  }
  const buffer = new Uint32Array(1);
  const range = 0x100000000;
  const limit = Math.floor(range / sides) * sides;
  let value: number;
  do {
    cryptoApi.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return (value % sides) + 1;
}

/** Roll a parsed expression. The random function is injectable for tests. */
export function rollDice(expression: string, random: DiceRandom = secureDie): DiceRollResult {
  const parsed = parseDiceExpression(expression);
  const terms: DiceTermRoll[] = parsed.terms.map(term => ({
    term,
    values: Array.from({length: term.count}, () => validRandomValue(term.sides, random)),
  }));
  return {
    expression,
    normalized: parsed.normalized,
    terms,
    modifier: parsed.modifier,
    total: terms.reduce((sum, term) => sum + term.values.reduce((a, b) => a + b, 0), 0) + parsed.modifier,
    dieCount: terms.reduce((sum, term) => sum + term.values.length, 0),
  };
}

function validRandomValue(sides: number, random: DiceRandom): number {
  const value = random(sides);
  if (!Number.isInteger(value) || value < 1 || value > sides) {
    throw new Error(`Генератор вернул недопустимое значение для d${sides}: ${value}.`);
  }
  return value;
}

/** Build a result from physical dice values (manual mode). Values are ordered
 * exactly as the terms in the expression. */
export function resultFromValues(expression: string, values: number[]): DiceRollResult {
  const parsed = parseDiceExpression(expression);
  const flat = parsed.terms.flatMap(term => Array.from({length: term.count}, () => term.sides));
  if (!Array.isArray(values) || values.length !== flat.length) {
    throw new Error(`Нужно указать ${flat.length} значений.`);
  }
  let index = 0;
  const terms: DiceTermRoll[] = parsed.terms.map(term => {
    const termValues = values.slice(index, index + term.count);
    index += term.count;
    termValues.forEach((value, i) => {
      if (!Number.isInteger(value) || value < 1 || value > term.sides) {
        throw new Error(`Значение ${i + 1} для d${term.sides} должно быть от 1 до ${term.sides}.`);
      }
    });
    return {term, values: termValues};
  });
  return {
    expression,
    normalized: parsed.normalized,
    terms,
    modifier: parsed.modifier,
    total: terms.reduce((sum, term) => sum + term.values.reduce((a, b) => a + b, 0), 0) + parsed.modifier,
    dieCount: flat.length,
  };
}
