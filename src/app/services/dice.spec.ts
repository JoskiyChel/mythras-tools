import {
  DICE_MAX_COUNT, DICE_MAX_SIDES, normalizeDiceExpression,
  parseDiceExpression, resultFromValues, rollDice,
} from './dice';

describe('Dice expressions', () => {
  it('parses mixed dice and modifiers, including the book minus sign', () => {
    const parsed = parseDiceExpression(' 1d8 + 2d6 − 3 ');
    expect(parsed.terms).toEqual([{count: 1, sides: 8}, {count: 2, sides: 6}]);
    expect(parsed.modifier).toBe(-3);
    expect(parsed.normalized).toBe('1d8+2d6-3');
    expect(normalizeDiceExpression(' 1D100 ')).toBe('1d100');
  });

  it('supports an omitted die count and a bare d100', () => {
    expect(parseDiceExpression('d100')).toEqual({
      terms: [{count: 1, sides: 100}], modifier: 0, normalized: '1d100',
    });
    expect(parseDiceExpression('1d2-1').terms).toEqual([{count: 1, sides: 2}]);
  });

  it('rejects malformed expressions and impossible dice', () => {
    [
      '', '1d8+', '1d8 1d6', 'abc', '1d1', `1d${DICE_MAX_SIDES + 1}`,
      `${DICE_MAX_COUNT + 1}d6`, '1d8*2', '--1d6', '0d6',
    ].forEach(expression => {
      expect(() => parseDiceExpression(expression)).toThrow();
    });
  });

  it('rolls every die with the injected generator and sums the modifier', () => {
    const values = [5, 1, 6];
    const result = rollDice('2d6+1d8-2', () => values.shift()!);
    expect(result.terms).toEqual([
      {term: {count: 2, sides: 6}, values: [5, 1]},
      {term: {count: 1, sides: 8}, values: [6]},
    ]);
    expect(result.total).toBe(10);
    expect(result.dieCount).toBe(3);
  });

  it('builds a manual result from physical die values', () => {
    const result = resultFromValues('2d6+3', [2, 5]);
    expect(result.total).toBe(10);
    expect(result.expression).toBe('2d6+3');
    expect(() => resultFromValues('2d6', [2])).toThrow();
    expect(() => resultFromValues('2d6', [2, 7])).toThrow();
  });

  it('rejects an invalid random generator result', () => {
    expect(() => rollDice('1d6', () => 0)).toThrow();
    expect(() => rollDice('1d6', () => 7)).toThrow();
  });
});
