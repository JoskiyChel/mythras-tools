import { HIT_LOCATION_RULES } from './hit-locations';

type JsonObject = Record<string, unknown>;

const PROFILE_LABELS: Record<string, string> = {
  name: 'имя',
  species: 'вид',
  culture: 'культура',
  career: 'карьера',
  frame: 'Frame',
  height: 'рост',
  weight: 'вес',
  age: 'возраст',
  concept: 'концепция',
  backstory: 'предыстория',
};

const TOP_LEVEL_LABELS: Record<string, string> = {
  currentHitPoints: 'текущие HP',
  currentValues: 'текущие значения',
  fatigueLevel: 'усталость',
  sessionNotes: 'заметки',
  money: 'деньги',
  equipment: 'снаряжение',
  magic: 'магия',
  passions: 'страсти',
  skills: 'навыки',
  hp: 'максимальные HP',
  companion: 'эффекты и травмы',
};

function parse(value: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonObject
      : null;
  } catch {
    return null;
  }
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonObject => entry !== null && typeof entry === 'object')
    : [];
}

function effectNames(effects: unknown): {id: string; name: string}[] {
  return asArray(effects).map(effect => ({
    id: String(effect['id'] ?? ''),
    name: String(effect['name'] ?? 'эффект'),
  }));
}

function locationLabel(key: string): string {
  return HIT_LOCATION_RULES.find(rule => rule.key === key)?.labelRu ?? key;
}

function describeCompanion(before: JsonObject, after: JsonObject): string | null {
  const beforeState = before['companion'];
  const afterState = after['companion'];
  if (same(beforeState, afterState)) return null;
  if (!beforeState || typeof beforeState !== 'object' || !afterState || typeof afterState !== 'object') {
    return 'Изменены эффекты и травмы';
  }
  const was = beforeState as JsonObject;
  const now = afterState as JsonObject;
  if (!same(was['injuries'], now['injuries'])) return 'Изменены травмы';
  const oldEffects = effectNames(was['effects']);
  const newEffects = effectNames(now['effects']);
  const oldById = new Map(oldEffects.map(effect => [effect.id, effect]));
  const newById = new Map(newEffects.map(effect => [effect.id, effect]));
  const added = newEffects.filter(effect => !oldById.has(effect.id));
  const removed = oldEffects.filter(effect => !newById.has(effect.id));
  if (added.length === 1 && !removed.length) return `Добавлен эффект «${added[0].name}»`;
  if (removed.length === 1 && !added.length) return `Снят эффект «${removed[0].name}»`;
  if (added.length || removed.length) return 'Изменены эффекты';
  const changed = newEffects.find(effect => {
    const old = oldById.get(effect.id);
    return old && !same(old, effect);
  });
  if (changed) return `Изменён эффект «${changed.name}»`;
  if (!same(was['gifts'], now['gifts'])) return 'Изменены сохранённые дары';
  return 'Изменены эффекты и травмы';
}

function describeHitPoints(before: JsonObject, after: JsonObject): string | null {
  const was = before['currentHitPoints'];
  const now = after['currentHitPoints'];
  if (same(was, now)) return null;
  if (!was || typeof was !== 'object' || !now || typeof now !== 'object') {
    return 'Изменены текущие HP';
  }
  const oldHp = was as JsonObject;
  const newHp = now as JsonObject;
  const keys = [...new Set([...Object.keys(oldHp), ...Object.keys(newHp)])]
    .filter(key => !same(oldHp[key], newHp[key]));
  if (keys.length === 1) {
    const key = keys[0];
    return `HP: ${locationLabel(key)} ${String(oldHp[key] ?? '—')} → ${String(newHp[key] ?? '—')}`;
  }
  return 'Изменены текущие HP';
}

function describeSkills(before: JsonObject, after: JsonObject): string | null {
  const was = before['skills'];
  const now = after['skills'];
  if (same(was, now)) return null;
  if (!was || typeof was !== 'object' || !now || typeof now !== 'object') {
    return 'Изменены навыки';
  }
  const oldSkills = was as JsonObject;
  const newSkills = now as JsonObject;
  const changedStats = ['str', 'con', 'siz', 'dex', 'int', 'pow', 'cha']
    .filter(key => !same(oldSkills[key], newSkills[key]));
  if (changedStats.length) {
    const names = changedStats.map(key => key.toUpperCase()).join(', ');
    return `Изменены характеристики: ${names}`;
  }
  if (!same(oldSkills['skills'], newSkills['skills']) ||
      !same(oldSkills['specialized'], newSkills['specialized']) ||
      !same(oldSkills['combatstyles'], newSkills['combatstyles']) ||
      !same(oldSkills['extraProfessionalCultureSkills'], newSkills['extraProfessionalCultureSkills']) ||
      !same(oldSkills['extraProfessionalCareerSkills'], newSkills['extraProfessionalCareerSkills']) ||
      !same(oldSkills['hobby'], newSkills['hobby'])) {
    return 'Изменены навыки';
  }
  return 'Изменены производные атрибуты';
}

/**
 * Human-readable description of one change between two serialized characters.
 * The history itself stays session-only; this function only formats a label.
 */
export function describeCharacterChange(beforeJson: string, afterJson: string): string {
  const before = parse(beforeJson);
  const after = parse(afterJson);
  if (!before || !after) return 'Изменён лист персонажа';
  if (same(before, after)) return 'Без изменений';

  const hitPoints = describeHitPoints(before, after);
  if (hitPoints) return hitPoints;
  const skills = describeSkills(before, after);
  if (skills) return skills;
  const companion = describeCompanion(before, after);
  if (companion) return companion;

  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !same(before[key], after[key]));
  const profile = changed.filter(key => PROFILE_LABELS[key]);
  if (profile.length === 1) return `Изменено поле: ${PROFILE_LABELS[profile[0]]}`;
  const labels = changed.map(key => TOP_LEVEL_LABELS[key]).filter(Boolean);
  if (labels.length === 1) return `Изменено: ${labels[0]}`;
  if (labels.length > 1) return `Изменены: ${labels.slice(0, 2).join(', ')}`;
  return 'Изменён лист персонажа';
}
