import { describeCharacterChange } from './sheet-history';

describe('Sheet history labels', () => {
  it('describes a changed name', () => {
    expect(describeCharacterChange('{"name":"Вано"}', '{"name":"Вано II"}'))
      .toBe('Изменено поле: имя');
  });

  it('describes one changed hit location', () => {
    expect(describeCharacterChange(
      '{"currentHitPoints":{"chest":5}}',
      '{"currentHitPoints":{"chest":3}}',
    )).toBe('HP: Грудь 5 → 3');
  });

  it('describes added and removed effects', () => {
    expect(describeCharacterChange(
      '{"companion":{"effects":[]}}',
      '{"companion":{"effects":[{"id":"e1","name":"Усталость","modifiers":[]}]}}',
    )).toBe('Добавлен эффект «Усталость»');
    expect(describeCharacterChange(
      '{"companion":{"effects":[{"id":"e1","name":"Усталость","modifiers":[]}]}}',
      '{"companion":{"effects":[]}}',
    )).toBe('Снят эффект «Усталость»');
  });

  it('describes characteristic changes without exposing raw JSON', () => {
    expect(describeCharacterChange(
      '{"skills":{"str":9}}',
      '{"skills":{"str":10}}',
    )).toBe('Изменены характеристики: STR');
  });

  it('falls back for an unknown field', () => {
    expect(describeCharacterChange('{"custom":"one"}', '{"custom":"two"}'))
      .toBe('Изменён лист персонажа');
  });
});
