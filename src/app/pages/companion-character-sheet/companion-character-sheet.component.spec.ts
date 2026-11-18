import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CombatStyle } from '../../model/combat-style';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { hydrateCharacter } from '../../services/character-format';
import { SheetModifier } from '../../services/companion-sheet';
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

  it('undoes and redoes character changes for the session', () => {
    component.character.name = 'До';
    component.ngDoCheck();
    component.character.name = 'После';
    component.ngDoCheck();
    expect(component.canUndo).toBeTrue();
    component.undoChange();
    expect(component.character.name).toBe('До');
    expect(component.canRedo).toBeTrue();
    component.redoChange();
    expect(component.character.name).toBe('После');
  });

  it('toggles dice animation independently of the roll mode', () => {
    const mode = component.diceMode;
    const initial = component.diceAnimation;
    component.toggleDiceAnimation();
    expect(component.diceAnimation).toBe(!initial);
    expect(component.diceMode).toBe(mode);
    component.toggleDiceAnimation();
    expect(component.diceAnimation).toBe(initial);
  });

  it('opens an existing effect with its full description for editing', () => {
    const description = 'Длинное описание эффекта. '.repeat(20).trim();
    const effect = {
      id: 'long-effect', name: 'Длинный эффект', duration: 'До конца сцены',
      description, modifiers: [{kind: 'skill' as const, key: 'brawn', amount: 10}],
    };
    component.openEffectDialog(effect);
    expect(component.addingEffect).toBeTrue();
    expect(component.editingEffectId).toBe('long-effect');
    expect(component.effectName).toBe('Длинный эффект');
    expect(component.effectDescription).toBe(description);
    expect(component.newModifiers).toEqual([{kind: 'skill', key: 'brawn', amount: 10}]);
  });

  it('resolves a manual d100 check and keeps the roll history in memory only', () => {
    const skill = component.character.skills.skills.find(entry => entry.name === 'Athletics')!;
    component.openSkill(skill);
    component.setCheckMode('manual');
    component.manualCheckRoll = 1;
    component.rollCheck();
    expect(component.checkResult?.outcome).toBe('critical');
    expect(component.checkResult?.roll).toBe(1);
    expect(component.checkHistory.length).toBe(1);
    expect(JSON.stringify(component.character)).not.toContain('checkHistory');

    component.manualCheckRoll = 100;
    component.rollCheck();
    expect(component.checkResult?.outcome).toBe('fumble');
    expect(component.checkHistory.length).toBe(2);
    component.clearCheckHistory();
    expect(component.checkHistory.length).toBe(0);
  });

  it('accepts a physical dice expression and reports parse errors', () => {
    component.setDiceMode('manual');
    component.diceExpression = '2d6+3';
    component.manualDiceValues = '2, 5';
    component.acceptManualDice();
    expect(component.diceResult?.total).toBe(10);
    expect(component.diceHistory.length).toBe(1);

    component.diceExpression = '2d6+';
    component.rollDiceExpression();
    expect(component.diceResult).toBeNull();
    expect(component.diceError).toContain('разобрать');
    component.clearDiceHistory();
    expect(component.diceHistory.length).toBe(0);
  });

  it('discards a new trauma and its modifiers when the editor is cancelled', () => {
    const before = JSON.stringify(component.character);
    const max = component.maxHp('leftArm');
    component.selectLocation('leftArm');
    component.toggleInjury('Увечье');
    expect(component.addingEffect).toBeTrue();
    expect(component.newModifiers).toEqual([{kind:'locationHp',key:'leftArm',amount:-1}]);
    expect(component.injuryText('leftArm')).toBe('');
    expect(component.maxHp('leftArm')).toBe(max);
    component.ngDoCheck();
    component.cancelEffect();
    component.ngDoCheck();
    expect(JSON.stringify(component.character)).toBe(before);
    expect(component.canUndo).toBeFalse();
  });

  it('combines physical traumas, retains their modifiers and removes each independently', () => {
    component.character.companion = {};
    component.selectLocation('leftArm');
    const baseMax = component.maxHp('leftArm');
    component.toggleInjury('Увечье');
    expect(component.effectName).toBe('Увечье левой руки');
    expect(component.effectDescription).toContain('навсегда теряет 1 пункт');
    expect(component.modifierLabel(component.newModifiers[0])).toBe('Максимальное здоровье: Левая рука -1');
    expect(component.addingEffect).toBeTrue();
    component.newModifiers[0].amount = -2;
    component.applyEffect();
    expect(component.injuryText('leftArm')).toBe('Увечье');
    expect(component.maxHp('leftArm')).toBe(baseMax - 2);

    component.toggleInjury('Отсечена');
    component.applyEffect();
    component.toggleInjury('Пронзена');
    component.applyEffect();
    component.toggleInjury('Кровотечение');
    component.applyEffect();
    component.toggleInjury('Шрам');
    component.applyEffect();
    expect(component.injuryText('leftArm')).toBe('Увечье, Отсечена, Пронзена, Кровотечение, Шрам');
    expect(component.maxHp('leftArm')).toBe(baseMax - 2);
    expect(component.selectedInjuryEffects.length).toBe(5);
    const severed = component.effects.find(effect => effect.injury?.type === 'Отсечена')!;
    expect(severed.name).toBe('Отсечённая левая рука');
    const arm = component.locations.find(loc => loc.key === 'leftArm')!;
    expect(component.woundImpale(arm)[3]).toBe(arm.stubAnchorY!);

    component.removeEffect(severed.id);
    expect(component.injuryText('leftArm')).toBe('Увечье, Пронзена, Кровотечение, Шрам');
    expect(component.woundImpale(arm)).toEqual(arm.impale);
    component.toggleInjury('Увечье');
    expect(component.maxHp('leftArm')).toBe(baseMax);
  });

  it('returns a legacy manual armour penalty to live calculation when reset', () => {
    component.character.equipment.head.enc = 6;
    component.character.equipment.armorPenalty = 4;
    component.takeOffArmour('head');
    expect(component.armourPenalty).toBe(4);
    expect(component.computedArmourPenalty).toBe(0);
    component.resetArmourPenalty();
    expect(component.manualArmourPenalty).toBeNull();
    expect(component.armourPenalty).toBe(0);
    component.character.equipment.head.enc = 6;
    expect(component.armourPenalty).toBe(2);
    component.editArmourPenalty();
    component.armourPenaltyDraft = 0;
    component.saveArmourPenalty();
    expect(component.manualArmourPenalty).toBe(0);
    expect(component.armourPenalty).toBe(0);
  });

  it('previews derived attribute changes during Становление', () => {
    component.beginUpgrade();
    component.alterStat('dex', 2);
    expect(component.attrDelta('init')).toBeGreaterThan(0);
    expect(component.deltaText(component.attrDelta('init'))).toContain('↑');
    expect(component.deltaText(-2)).toBe('↓ −2');
    component.alterStat('dex', -2);
    expect(component.attrDelta('init')).toBe(0);
  });

  it('shows effect modifiers with the same labels as the editor', () => {
    expect(component.modifierLabel({kind:'characteristic',key:'str',amount:1}))
      .toBe('Характеристика: STR +1');
    expect(component.modifierLabel({kind:'magic',key:'theism.poolMax',amount:2}))
      .toBe('Магия: Theism · максимум Devotion Pool +2');
    const locationModifier:SheetModifier = {kind:'characteristic',key:'str',amount:1};
    component.setModifierKind(locationModifier,'locationHp');
    expect(locationModifier.key).toBe('head');
    expect(locationModifier.amount).toBe(-1);
    expect(component.modifierLabel(locationModifier)).toBe('Максимальное здоровье: Голова -1');
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
    expect(component.ap('chest')).toBe(0);
    expect(component.armourLoad.gear).toBeGreaterThan(0);
    const selection = document.createElement('select');
    selection.add(new Option('Linothorax', '0', true, true));
    component.wearArmour('chest', selection);
    expect(component.character.equipment.chest.type).toBe('Linothorax');
    expect(component.ap('chest')).toBe(3);
    expect(component.armourLoad.worn).toBeGreaterThan(0);
    component.takeOffArmour('chest');
    expect(component.ap('chest')).toBe(0);
    const copy = hydrateCharacter(JSON.parse(JSON.stringify(component.character)));
    expect(copy.equipment.spareArmour?.[0].piece.type).toBe('Linothorax');

    component.openItemPicker();
    component.addItem({item:'Backpack', enc:'1', cost:'5'});
    expect(component.character.equipment.items.some(item => item.name === 'Backpack')).toBeTrue();

    component.openSpellPicker('folk');
    component.addSpell({name:'Avert', tags:'Instant', description:'Dismiss a spell.'});
    expect(component.character.magic.folk.some(spell => spell.name === 'Avert')).toBeTrue();
  });

  it('separates wound effects by active location and reports severity at the HP boundaries', () => {
    component.character.companion = {effects: [
      {id: 'chest', name: 'Chest bleed', duration: '', modifiers: [], injury: {location: 'chest', type: 'Кровотечение'}},
      {id: 'leg', name: 'Leg scar', duration: '', modifiers: [], injury: {location: 'leftLeg', type: 'Шрам'}},
      {id: 'global', name: 'Fear', duration: '', modifiers: []},
    ]};
    const max = component.maxHp('chest');
    for (const [current, label] of [[max, 'healthy'], [max - 1, 'minor'], [0, 'serious'], [-max, 'major']] as const) {
      component.character.currentHitPoints = {chest: current};
      expect(component.woundSeverity('chest')).toBe(label);
    }
    expect(component.selectedInjuryEffects.map(effect => effect.id)).toEqual(['chest']);
    component.selectLocation('leftLeg');
    expect(component.selectedInjuryEffects.map(effect => effect.id)).toEqual(['leg']);
    expect(component.generalEffects.map(effect => effect.id)).toEqual(['global']);
  });

  it('discards new sheet entries and saves applied languages, passions and custom magic skills', () => {
    const fillDraft = () => {
      component.beginUpgrade();
      component.draftEntryKind = 'passion';
      component.passionName = 'Protect the village';
      component.passionValue = 55;
      component.addDraftPassion();
      component.draftEntryKind = 'language';
      component.customSkillName = 'Greek';
      component.createDraftSkill();
      component.draftEntryKind = 'custom';
      component.customSkillName = 'Star lore';
      component.customSkillCategory = 'magic';
      component.createDraftSkill();
    };
    const before = JSON.stringify(component.character);
    fillDraft();
    expect(component.groups.find(group => group.name === 'Магические навыки')?.skills.map(skill => skill.name)).toContain('Star lore');
    component.discardUpgrade();
    expect(JSON.stringify(component.character)).toBe(before);

    fillDraft();
    component.applyUpgrade();
    const saved = hydrateCharacter(JSON.parse(JSON.stringify(component.character)));
    expect(saved.passions[0].modifierNumber).toBe(55);
    expect(saved.skills.skills.find(skill => skill.name === 'Language (Greek)')?.base).toEqual(['int', 'cha']);
    expect(saved.skills.skills.find(skill => skill.name === 'Star lore')?.category).toBe('magic');
  });

  it('opens an Athletics check for climbing with only rollable difficulties', () => {
    component.movementDialog = true;
    component.openMovementCheck('Лазание');
    expect(component.movementDialog).toBeFalse();
    expect(component.activeSkill?.name).toBe('Athletics');
    expect(component.selectedDifficulty.name).toBe('Standard');
    expect(component.difficulties.map(step => step.name)).toEqual(['Very Easy', 'Easy', 'Standard', 'Hard', 'Formidable', 'Herculean']);
  });

  it('preserves spirit records and legacy spirit notes after export and reimport', () => {
    component.character.magic.spirits = 'Legacy notes';
    component.spiritDraft = {name: ' River guardian ', state: 'bound', vessel: 'Amulet', abilities: 'Ward', resources: '3 MP'};
    component.addSpirit();
    const saved = hydrateCharacter(JSON.parse(JSON.stringify(component.character)));
    expect(saved.magic.spirits).toBe('Legacy notes');
    expect(saved.magic.spiritRecords?.[0]).toEqual({name: 'River guardian', state: 'bound', vessel: 'Amulet', abilities: 'Ward', resources: '3 MP'});
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
