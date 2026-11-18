import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  AdvancementAction, AdvancementEntry, advancementRoll, advancementSkill, advancementSkills, applyAdvancement,
  balanceAdjustment, experienceBalance, trainingExpression, trainingPrice, trainingShift, validExperienceBalance,
} from '../../services/character-advancement';
import type { Skill } from '../../model/skill';
import { getSkillTotal } from '../../services/character-service.service';
import {
  CHARACTERISTICS, CharacteristicKey, CompanionCharacter, attributeTotal, currentCharacteristic, damageModifier,
  magicPointMaximum, maxLocationHp, movementSummary, skillTotal,
} from '../../services/companion-sheet';
import { HIT_LOCATION_RULES } from '../../services/hit-locations';

interface PreviewRow { label: string; before: string | number; after: string | number; change: string; }
type Mode = 'experience' | 'training';

@Component({
  selector: 'app-character-advancement',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule],
  templateUrl: './character-advancement.component.html',
  styleUrls: ['./character-advancement.component.scss'],
})
export class CharacterAdvancementComponent implements OnChanges {
  @Input() character!: CompanionCharacter;
  @Input() entries: readonly AdvancementEntry[] = [];
  @Input() projected?: CompanionCharacter;
  @Output() draftChanged = new EventEmitter<{entries: AdvancementEntry[]; projected?: CompanionCharacter}>();
  readonly keys = CHARACTERISTICS.filter(key => key !== 'siz');
  readonly balance = experienceBalance;
  readonly modes: { key: Mode; label: string }[] = [
    { key: 'experience', label: 'Опыт' }, { key: 'training', label: 'Тренировка' },
  ];
  mode: Mode = 'experience';
  experienceKind = 'experience';
  skillIndex: number | null = null;
  passionIndex: number | null = null;
  stat: CharacteristicKey = 'str';
  value: number | null = null;
  maximum: number | null = null;
  minimum: number | null = null;
  mentorSkill: number | null = null;
  teach: number | null = null;
  modifier: number | null = 0;
  mentor = '';
  period = '';
  terms = '';
  manualD100 = '';
  manualD4 = '';
  manualTeach = '';
  manualTraining = '';
  resolvedTeach?: number;
  confirmed = false;
  reducePassion = false;
  tradition: Extract<AdvancementAction, { kind: 'magic' }>['tradition'] = 'folk';
  magicDescription = '';
  rows: PreviewRow[] = [];
  options: ReturnType<typeof advancementSkills> = [];
  dialogOpen = false;
  error = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projected'] || changes['character']) {
      this.options = advancementSkills(this.draft);
      this.rows = this.projected ? this.differences(this.projected) : [];
    }
  }

  open(dialog: HTMLDialogElement): void {
    this.mode = 'experience';
    this.experienceKind = 'experience';
    this.resetInput();
    this.dialogOpen = true;
    dialog.showModal();
  }

  dismissOnBackdrop(event: MouseEvent, dialog: HTMLDialogElement): void {
    if (event.target !== dialog) return;
    const {left, right, top, bottom} = dialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
  }

  get draft(): CompanionCharacter { return this.projected ?? this.character; }
  skillLabel(skill: Skill): string {
    const matching = this.options.filter(option => option.skill.name === skill.name);
    return matching.length <= 1 ? skill.name : skill.name + ' · ' + (matching.findIndex(option => option.skill === skill) + 1);
  }
  get selected() {
    const entry = this.skillIndex === null ? undefined : this.options[this.skillIndex];
    return entry && entry.learned === (this.experienceKind !== 'learn' || this.mode !== 'experience') ? entry : undefined;
  }
  get training() { return this.draft.advancement?.training; }
  get trainingSkill() { return this.training ? advancementSkill(this.draft, this.training.skill) : undefined; }
  get currentTrainingExpression(): string | undefined {
    if (!this.training || !this.trainingSkill) return;
    const shift = this.training.teach === undefined ? 0 : trainingShift(this.training.teach, this.resolvedTeach ?? 0);
    return shift === undefined ? undefined : trainingExpression(this.training.mentorSkill - getSkillTotal(this.draft, this.trainingSkill), shift);
  }
  get trainingCost(): number | undefined {
    return this.mentorSkill === null || this.mentorSkill < 0 || (this.teach ?? 0) < 0
      ? undefined : trainingPrice(this.mentorSkill, this.teach ?? 0);
  }
  get trainingDie(): string | undefined {
    if (this.mentorSkill === null || !this.selected) return;
    return trainingExpression(this.mentorSkill - getSkillTotal(this.draft, this.selected.skill));
  }

  resetInput(): void {
    this.error = '';
    this.skillIndex = null;
    this.passionIndex = null;
    this.value = null;
    this.confirmed = false;
    this.maximum = null;
    this.minimum = null;
    this.mentorSkill = null;
    this.teach = null;
    this.modifier = 0;
    this.mentor = '';
    this.period = '';
    this.terms = '';
    this.magicDescription = '';
    this.reducePassion = false;
    this.manualD100 = '';
    this.manualD4 = '';
    this.manualTeach = '';
    this.manualTraining = '';
    this.resolvedTeach = undefined;
  }

  add(action: AdvancementAction, description: string): void {
    try {
      this.refresh([...this.entries, {action, description}]);
      this.confirmed = false;
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  changeBalance(value: number): boolean {
    if (!validExperienceBalance(value)) {
      this.error = 'Укажите целое число бросков от 0.';
      return false;
    }
    const delta = value - experienceBalance(this.draft);
    if (delta) {
      const {action, description} = balanceAdjustment(delta);
      this.add(action, description);
    }
    return true;
  }

  remove(index: number): void {
    try {
      this.refresh(this.entries.filter((_, i) => i !== index));
    } catch {
      this.error = 'Операция нужна следующему шагу. Сначала уберите зависящий от неё шаг.';
    }
  }

  clear(): void {
    this.refresh([]);
  }

  private refresh(entries: AdvancementEntry[]): void {
    const projected = entries.length ? applyAdvancement(this.character, entries.map(entry => entry.action)) : undefined;
    this.draftChanged.emit({entries, projected});
    this.skillIndex = null;
    this.error = '';
  }

  private differences(projected: CompanionCharacter): PreviewRow[] {
    const original = this.character;
    const rows: PreviewRow[] = [];
    const compare = (label: string, before: number | string, after: number | string) => {
      if (before === after) return;
      const delta = typeof before === 'number' && typeof after === 'number' ? after - before : 0;
      rows.push({label, before, after, change: delta ? (delta > 0 ? '+' : '') + delta : ''});
    };
    compare('Броски опыта', experienceBalance(original), experienceBalance(projected));
    for (const key of CHARACTERISTICS) {
      compare(key.toUpperCase(), currentCharacteristic(original, key), currentCharacteristic(projected, key));
    }
    for (const {address, skill, learned} of advancementSkills(original)) {
      const next = advancementSkill(projected, address);
      if (next && (learned || next.force)) {
        compare(this.skillLabel(next),
          learned ? skillTotal(original, skill) : 'Не изучен', skillTotal(projected, next));
      }
    }
    for (const [index, passion] of original.passions.entries()) {
      if (passion?.passion) compare(passion.passion, passion.modifierNumber ?? '—', projected.passions[index]?.modifierNumber ?? '—');
    }
    for (const key of ['ap', 'expMod', 'healing', 'luck', 'init'] as const) {
      compare(original.skills[key].name, attributeTotal(original, key), attributeTotal(projected, key));
    }
    compare('Damage Modifier', damageModifier(original), damageModifier(projected));
    compare('Скорость, м', movementSummary(original).walking, movementSummary(projected).walking);
    compare('Максимум очков магии', magicPointMaximum(original), magicPointMaximum(projected));
    for (const {key, labelRu} of HIT_LOCATION_RULES) {
      compare(labelRu + ' · максимум HP', maxLocationHp(original, key), maxLocationHp(projected, key));
    }
    return rows;
  }

  addExperience(): void {
    const selected = this.selected;
    const value = this.value ?? NaN;
    switch (this.experienceKind) {
      case 'award':
        this.add({ kind:'award', rolls:value, modifier:this.modifier ?? 0 }, 'Награда ведущего · ' + (value + (this.modifier ?? 0)) + ' ER до содержания');
        return;
      case 'experience':
      case 'passion': {
        const passion = this.passionIndex === null ? undefined : this.draft.passions[this.passionIndex];
        const score = this.experienceKind === 'experience' ? selected && getSkillTotal(this.draft, selected.skill) : passion?.modifierNumber;
        if (!Number.isFinite(score) || !Number.isFinite(Number(this.draft.skills.int)) || experienceBalance(this.draft) < 1) {
          this.error = 'Выберите навык или страсть с постоянным значением. Нужны INT и один доступный бросок опыта.';
          return;
        }
        const d100 = advancementRoll('d100', this.manualD100);
        const needsD4 = d100 !== undefined && d100 + Number(this.draft.skills.int) >= score!;
        const d4 = needsD4 ? advancementRoll('d4', this.manualD4) : undefined;
        if (d100 === undefined || needsD4 && d4 === undefined) { this.error = 'Неверный результат кубика.'; return; }
        const dice = ' · d100 ' + d100 + (d4 === undefined ? '' : ', d4 ' + d4) + ' · 1 ER';
        if (this.experienceKind === 'experience' && selected) {
          this.add({ kind:'experience', skill:selected.address, d100, d4 }, 'Опыт · ' + selected.skill.name + dice);
        } else if (passion && this.passionIndex !== null) {
          this.add({ kind:'passion', index:this.passionIndex, d100, d4, reduce:this.reducePassion }, 'Опыт · ' + passion.passion + dice);
        }
        return;
      }
      case 'fumble':
        if (selected && this.confirmed) this.add({ kind:'fumble', skill:selected.address }, 'Критический провал · ' + selected.skill.name + ' · 0 ER');
        return;
      case 'learn':
        if (selected && this.confirmed) this.add({ kind:'learn', skill:selected.address, source:this.mentor, month:this.period }, 'Изучение · ' + selected.skill.name + ' · 3 ER · ' + this.mentor + ' · ' + this.period);
        return;
      case 'regime':
        if (this.confirmed) this.add({ kind:'regime', key:this.stat, steps:value, maximum:this.maximum ?? NaN }, 'Режим тренировки · ' + this.stat.toUpperCase() + ' · ступеней: ' + value);
        return;
      case 'permanent':
        if (this.confirmed) this.add({ kind:'permanent', key:this.stat, minimum:this.minimum ?? NaN, maximum:this.maximum ?? NaN }, 'Опциональное развитие · ' + this.stat.toUpperCase());
        return;
      case 'magic':
        if (this.confirmed) this.add({ kind:'magic', tradition:this.tradition, name:this.mentor, description:this.magicDescription, rolls:value, study:this.period }, 'Изучение магии · ' + this.mentor + ' · ' + value + ' ER · ' + this.period);
    }
  }

  startTraining(): void {
    if (!this.selected || !this.confirmed) return;
    const skill = this.selected;
    this.add({ kind:'startTraining', training:{ skill:skill.address, mentor:this.mentor, mentorSkill:this.mentorSkill ?? NaN,
      teach:this.teach ?? undefined, period:this.period, terms:this.terms } }, 'Начало тренировки · ' + skill.skill.name +
      ' · ' + this.mentor + ' · ' + this.period + ' · ' + this.terms);
  }

  finishTraining(): void {
    if (!this.training || !this.trainingSkill || !this.confirmed) return;
    const teachRoll = this.resolvedTeach;
    const expression = this.currentTrainingExpression;
    const baseDie = expression?.match(/^d\d+/)?.[0];
    const die = baseDie ? advancementRoll(baseDie, this.manualTraining) : undefined;
    if (!expression || baseDie && die === undefined) { this.error = 'Проверьте броски Teach и прироста.'; return; }
    const result = expression === '0' ? 0 : advancementRoll(expression, String(die));
    this.add({ kind:'finishTraining', week:this.period, teachRoll, die }, 'Тренировка · ' + this.trainingSkill.name +
      ' · ' + this.period + ' · ' + expression + ' → ' + result + (teachRoll === undefined ? '' : ' · Teach d100 ' + teachRoll));
  }

  resolveTeach(): void {
    const roll = advancementRoll('d100', this.manualTeach);
    if (roll === undefined) {
      this.error = 'Введите допустимый результат Teach на d100.';
      return;
    }
    this.error = '';
    this.resolvedTeach = roll;
  }

}
