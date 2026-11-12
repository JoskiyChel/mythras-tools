import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { hydrateCharacter } from '../../services/character-format';
import { CompanionCharacterSheetComponent } from './companion-character-sheet.component';

describe('Companion permanent advancement', () => {
  let component: CompanionCharacterSheetComponent;
  let fixture: ComponentFixture<CompanionCharacterSheetComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CompanionCharacterSheetComponent, RouterTestingModule],
    });
    fixture = TestBed.createComponent(CompanionCharacterSheetComponent);
    component = fixture.componentInstance;
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
  it('keeps a permanent injury visible after HP are healed', () => {
    component.character.companion = {injuries: {chest: 'Раздроблена'}};
    component.character.currentHitPoints = {chest: 7};
    expect(component.injuryMark('chest')).toBeTrue();
    expect(component.injuryMark('head')).toBeFalse();
  });

  it('retains skill and magic buttons across change detection for focus restoration', () => {
    spyOn(component.storage, 'readCharacter').and.returnValue(component.character);
    spyOn(component.storage, 'createDebouncedSave').and.returnValue({
      schedule: () => {}, flush: () => {}, destroy: () => {},
    });
    component.character.magic.folk = [{name: 'Alarm', tags: '', description: 'Test spell'}];
    component.activeTab = 'magic';
    fixture.detectChanges();
    const skill = fixture.nativeElement.querySelector('.skill-name');
    const magic = fixture.nativeElement.querySelector('.magic-skill-button');
    const spell = fixture.nativeElement.querySelector('.spell button');
    expect(magic).not.toBeNull();
    skill.focus();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.skill-name')).toBe(skill);
    expect(fixture.nativeElement.querySelector('.magic-skill-button')).toBe(magic);
    expect(fixture.nativeElement.querySelector('.spell button')).toBe(spell);
    expect(document.activeElement).toBe(skill);
  });

});
