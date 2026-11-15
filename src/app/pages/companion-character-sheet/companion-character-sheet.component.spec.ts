import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CombatStyle } from '../../model/combat-style';
import { Router } from '@angular/router';
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
  it('keeps permanent injuries visible after HP are healed, with several types per location', () => {
    component.character.companion = {injuries: {chest: ['Увечье']}};
    component.character.currentHitPoints = {chest: 7};
    expect(component.injuryMark('chest')).toBeTrue();
    expect(component.injuryMark('head')).toBeFalse();
    component.character.companion = {injuries: {chest: ['Увечье','Кровотечение']}};
    expect(component.injuryText('chest')).toBe('Увечье, Кровотечение');
    expect(component.hasWoundType('chest','Увечье')).toBeTrue();
    expect(component.hasWoundType('chest','Отсечена')).toBeFalse();
    const arm=component.locations.find(location=>location.key==='leftArm')!;
    expect(component.partPath(arm)).toBe(arm.path);
    component.character.companion = {injuries: {leftArm: ['Отсечена']}};
    expect(component.partPath(arm)).toBe(arm.stubPath!);
    // Lost HP alone is not an injury (ТЗ §5.4).
    component.character.companion = {};
    component.character.currentHitPoints = {chest: -5};
    expect(component.injuryMark('chest')).toBeFalse();
  });

  it('makes physical traumas exclusive, links them to effects and removes both sides', () => {
    component.character.companion = {};
    component.selectLocation('leftArm');
    const baseMax = component.maxHp('leftArm');
    component.toggleInjury('Увечье');
    expect(component.injuryText('leftArm')).toBe('Увечье');
    expect(component.maxHp('leftArm')).toBe(baseMax - 1);
    const maim = component.effects.find(effect => effect.injury?.type === 'Увечье')!;
    expect(maim.name).toBe('Увечье левой руки');
    expect(maim.description).toContain('навсегда теряет 1 пункт');
    expect(component.addingEffect).toBeTrue();
    component.cancelEffect();
    expect(component.effects).toContain(maim);

    component.toggleInjury('Отсечена');
    expect(component.injuryText('leftArm')).toBe('Отсечена');
    expect(component.effects.some(effect => effect.injury?.type === 'Увечье')).toBeFalse();
    const severed = component.effects.find(effect => effect.injury?.type === 'Отсечена')!;
    expect(severed.name).toBe('Отсечённая левая рука');
    component.cancelEffect();

    component.removeEffect(severed.id);
    expect(component.injuryText('leftArm')).toBe('');
  });

  it('shows effect modifiers with the same labels as the editor', () => {
    expect(component.modifierLabel({kind:'characteristic',key:'str',amount:1}))
      .toBe('Характеристика: STR +1');
    expect(component.modifierLabel({kind:'magic',key:'theism.poolMax',amount:2}))
      .toBe('Магия: Theism · максимум Devotion Pool +2');
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

  it('uses the actual style Skill for difficulties and exposes complete style and trait rules', () => {
    const style=new CombatStyle('Hoplite',{culture:'Greek',background:'Citizens',source:'Campaign',
      weapons:{Melee:'Spear, Xiphos',Shields:'Hoplon'},
      selectedTrait:{name:'Shield Wall',trait:'Form a shield wall.'},traits:[{name:'Shield Wall',trait:'Form a shield wall.'}]});
    style.extraBonus=30;component.character.skills.combatstyles.push(style);
    spyOn(component.storage,'readCharacter').and.returnValue(component.character);
    spyOn(component.storage,'createDebouncedSave').and.returnValue({schedule:()=>{},flush:()=>{},destroy:()=>{}});
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.style-skill').click();
    expect(component.activeSkill).toBe(style);
    expect(component.difficultyTarget(0.5)).toBe(Math.ceil(component.skillValue(style)*0.5));
    component.onEscape();
    fixture.nativeElement.querySelector('.style-info').click();
    expect(component.activeInfo?.title).toBe('Hoplite');
    expect(JSON.stringify(component.activeInfo)).toContain('Spear, Xiphos');
    component.openStyleTrait(style);
    expect(component.activeInfo?.sections[0].paragraphs).toEqual(['Form a shield wall.']);
    expect(component.activeInfo?.title).toBe('Shield Wall');
  });

  it('resolves qualified weapon effects and handles custom rules without losing their names', () => {
    const weapon={name:'Test shield',offensiveSkills:'Bash, Bleed, Bash',defensiveSkills:'Pin Weapon (Shield)',traits:[]};
    expect(component.weaponEffectNames(weapon,'offensive')).toEqual(['Bash','Bleed']);
    component.openWeaponEffect('Pin Weapon (Shield)',weapon);
    expect(component.activeInfo?.title).toBe('Pin Weapon (Shield)');
    expect(component.activeInfo?.sections.some(s=>s.label==='Условия')).toBeTrue();
    expect(JSON.stringify(component.activeInfo)).toContain('opponent');
    component.openWeaponEffect('Custom effect',{name:'Relic',traits:[{name:'Custom effect',description:'Custom rules'}]});
    expect(JSON.stringify(component.activeInfo)).toContain('Custom rules');
    component.openWeaponEffect('Unknown',weapon);
    expect(JSON.stringify(component.activeInfo)).toContain('Описание отсутствует');
    expect(component.weaponDamage({damage:'2d8',oneHanded:'1d8'})).toBe('2d8');
  });

  it('keeps Devotion Pool in native fields, bounds current points and shows trained sorcerers without spells', () => {
    component.character.devotionPool=8;component.character.devotionPoolCurrent=3;
    expect(component.devotionCurrent).toBe(3);
    expect(component.traditions.some(t=>t.title==='Theism')).toBeTrue();
    component.setDevotionCurrent(99);expect(component.character.devotionPoolCurrent).toBe(8);
    component.setDevotionMaximum(4);expect(component.character.devotionPoolCurrent).toBe(4);
    component.setDevotionCurrent(-2);expect(component.character.devotionPoolCurrent).toBe(0);
    const skill=component.magicSkill('Shaping')!;skill.force=true;
    const baseline=component.skillValue(skill);skill.extraBonus=31-baseline;
    expect(component.shapingPoints).toBe(4);
    expect(component.traditions.some(t=>t.title==='Sorcery')).toBeTrue();
    component.beginUpgrade();component.alterSkill(skill,10);
    expect(component.shapingPoints).toBe(5);
    component.discardUpgrade();expect(component.shapingPoints).toBe(4);
    const saved=hydrateCharacter(JSON.parse(JSON.stringify(component.character)));
    expect(saved.devotionPool).toBe(4);expect(saved.devotionPoolCurrent).toBe(0);
  });

  it('learns a professional skill in the sheet preview and writes it only on apply', () => {
    component.beginUpgrade();
    const candidate = component.addableSkills[0];
    expect(candidate).withContext('a professional skill from the catalogue').toBeTruthy();
    component.newSkillName = candidate.name;
    component.addDraftSkill();
    expect(component.isDraftAdded(candidate)).toBeTrue();
    expect(component.skillValue(candidate)).toBeGreaterThan(0);
    expect(component.groups[2].skills).toContain(candidate);
    expect(component.hasUpgrade).toBeTrue();
    component.applyUpgrade();
    expect(candidate.force).toBeTrue();
    expect(component.upgrade).toBeFalse();
  });

  it('adds weapons, armour, items and spells from the sheet', () => {
    const dagger = component.weaponCatalog.find(weapon => weapon.name === 'Dagger')!;
    component.addWeapon(dagger);
    expect(component.character.equipment.weapons.some(weapon => weapon.name === 'Dagger')).toBeTrue();

    component.openArmourPicker('chest');
    const linothorax = component.armourPresets.find(preset => preset.type === 'Linothorax')!;
    component.chooseArmour(linothorax);
    expect(component.character.equipment.chest.type).toBe('Linothorax');
    expect(component.ap('chest')).toBe(3);

    component.openItemPicker();
    component.addItem({item:'Backpack', enc:'1', cost:'5'});
    expect(component.character.equipment.items.some(item => item.name === 'Backpack')).toBeTrue();

    component.openSpellPicker('folk');
    component.addSpell({name:'Avert', tags:'Instant', description:'Dismiss a spell.'});
    expect(component.character.magic.folk.some(spell => spell.name === 'Avert')).toBeTrue();
  });

  it('filters the weapon picker by the character combat styles', () => {
    component.character.skills.combatstyles = [new CombatStyle('Hoplite', {
      culture: 'Greek', weapons: { Melee: 'Spear, Xiphos' },
    })];
    component.weaponStyleOnly = true;
    const names = component.filteredWeapons.map(weapon => weapon.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every(name => /spear|xiphos/i.test(name))).toBeTrue();
  });

  it('carries the current Character into a specific constructor step', () => {
    const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
    const save=spyOn(component.storage,'setJson').and.stub();
    component.editInBuilder('customization','weapons');
    expect(save).toHaveBeenCalledWith('creation-character',component.character);
    expect(navigate).toHaveBeenCalledWith(['/character-creation'],{queryParams:{section:'customization',focus:'weapons'}});
  });

});
