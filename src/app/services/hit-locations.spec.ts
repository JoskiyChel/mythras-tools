import { HIT_LOCATION_ORDER, HIT_LOCATION_RULES, hitLocationForRoll, hitLocationRule } from './hit-locations';
import { HIT_LOCATIONS } from './hit-points';

describe('Hit location rules (ТЗ §5.1)', () => {
  it('lists locations in the required top-down order', () => {
    expect(HIT_LOCATION_ORDER).toEqual(['head', 'leftArm', 'rightArm', 'chest', 'abdoment', 'leftLeg', 'rightLeg']);
    expect(HIT_LOCATION_RULES.map(rule => rule.labelRu)).toEqual(
      ['Голова', 'Левая рука', 'Правая рука', 'Грудь', 'Живот', 'Левая нога', 'Правая нога']);
  });

  it('keeps the book d20 ranges for every location', () => {
    expect(HIT_LOCATION_RULES.map(rule => [rule.key, rule.rollMin, rule.rollMax])).toEqual([
      ['head', 19, 20], ['leftArm', 16, 18], ['rightArm', 13, 15], ['chest', 10, 12],
      ['abdoment', 7, 9], ['leftLeg', 4, 6], ['rightLeg', 1, 3],
    ]);
  });

  it('maps every d20 result to exactly one location', () => {
    const hits = new Map<string, number>();
    for (let roll = 1; roll <= 20; roll++) {
      const location = hitLocationForRoll(roll);
      expect(location).withContext('roll ' + roll).not.toBeNull();
      hits.set(location!, (hits.get(location!) || 0) + 1);
    }
    expect([...hits.keys()].sort()).toEqual([...HIT_LOCATION_ORDER].sort());
    expect(hitLocationForRoll(0)).toBeNull();
    expect(hitLocationForRoll(21)).toBeNull();
    expect(hitLocationForRoll(7.5)).toBeNull();
  });

  it('keeps the legacy left/right keys aligned with their labels', () => {
    expect(hitLocationRule('rightArm').labelRu).toBe('Правая рука');
    expect(hitLocationRule('rightArm').roll).toBe('13–15');
    expect(hitLocationRule('leftArm').labelRu).toBe('Левая рука');
    expect(hitLocationRule('leftArm').roll).toBe('16–18');
    expect(hitLocationRule('abdoment').labelRu).toBe('Живот');
  });

  it('feeds the legacy viewer list with the same order and English labels', () => {
    expect(HIT_LOCATIONS.map(entry => entry.key)).toEqual(HIT_LOCATION_ORDER);
    expect(HIT_LOCATIONS.find(entry => entry.key === 'leftArm')!.label).toBe('Left arm');
  });
});
