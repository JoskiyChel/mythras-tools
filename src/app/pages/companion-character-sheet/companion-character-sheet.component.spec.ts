import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppStorageService } from '../../services/app-storage.service';
import { hydrateCharacter } from '../../services/character-format';
import { CompanionCharacterSheetComponent } from './companion-character-sheet.component';

describe('Companion permanent advancement', () => {
  let component: CompanionCharacterSheetComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CompanionCharacterSheetComponent, RouterTestingModule],
    });
    component = TestBed.createComponent(CompanionCharacterSheetComponent).componentInstance;
    // Older JSON legitimately contains numeric strings and manual overrides.
    component.character = hydrateCharacter({
      skills: {str: '11', con: '11', siz: '10', dex: '17', int: '10', pow: '10', cha: '11'},
      currentValues: {str: '12', con: ''},
      companion: {effects: [{id: 'effect', name: 'Strength', duration: '',
        modifiers: [{kind: 'characteristic', key: 'str', amount: 3}]}]},
    });
  });

  it('adds numeric advancements without concatenating strings or changing untouched fields', () => {
    component.beginUpgrade();
    component.alterStat('str', 1);
    expect(component.charValue('str')).toBe(16);
    component.applyUpgrade();
    expect(component.character.skills.str).toBe(12);
    expect(component.character.currentValues!['str']).toBe(13);
    expect(component.character.skills.con as unknown).toBe('11');
    expect(component.character.currentValues!['con']).toBe('');
    expect(component.charValue('str')).toBe(16);
  });

  it('discards a preview without changing the saved character', () => {
    const before = JSON.stringify(component.character);
    component.beginUpgrade();
    component.alterStat('str', 2);
    component.alterSkill(component.character.skills.skills[0], 5);
    component.discardUpgrade();
    expect(JSON.stringify(component.character)).toBe(before);
    expect(component.hasUpgrade).toBeFalse();
  });
});
