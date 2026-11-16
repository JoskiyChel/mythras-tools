import {CheckThresholds} from './companion-sheet';
import {normalizeD100, resolveSkillCheck} from './skill-check';

describe('Skill check resolution', () => {
  const normal = (ordinary: number, critical: number, fumbleFrom: number): CheckThresholds => ({
    mode: 'normal', ordinary, critical, fumbleFrom,
  });

  it('distinguishes critical, success, failure and fumble', () => {
    const target = normal(47, 5, 99);
    expect(resolveSkillCheck(5, target).outcome).toBe('critical');
    expect(resolveSkillCheck(6, target).outcome).toBe('success');
    expect(resolveSkillCheck(47, target).outcome).toBe('success');
    expect(resolveSkillCheck(48, target).outcome).toBe('failure');
    expect(resolveSkillCheck(99, target).outcome).toBe('fumble');
    expect(resolveSkillCheck(100, target).outcome).toBe('fumble');
  });

  it('applies the automatic 01–05 success and 96–00 failure rules', () => {
    expect(resolveSkillCheck(3, normal(2, 1, 99)).outcome).toBe('success');
    expect(resolveSkillCheck(96, normal(120, 12, 100)).outcome).toBe('failure');
    expect(resolveSkillCheck(99, normal(120, 12, 100)).outcome).toBe('failure');
    expect(resolveSkillCheck(100, normal(120, 12, 100)).outcome).toBe('fumble');
  });

  it('does not require a roll for Automatic and Hopeless', () => {
    const automatic = resolveSkillCheck(100, {mode: 'automatic', ordinary: null, critical: null, fumbleFrom: null});
    const hopeless = resolveSkillCheck(1, {mode: 'hopeless', ordinary: null, critical: null, fumbleFrom: null});
    expect(automatic.outcome).toBe('automatic');
    expect(automatic.roll).toBeNull();
    expect(hopeless.outcome).toBe('hopeless');
    expect(hopeless.roll).toBeNull();
  });

  it('rejects impossible d100 values', () => {
    [0, 101, 1.5, NaN].forEach(value => expect(() => normalizeD100(value)).toThrow());
  });
});
