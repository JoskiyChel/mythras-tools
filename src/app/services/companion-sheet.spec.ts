import { Skill } from '../model/skill';
import { hydrateCharacter } from './character-format';
import { getCurrentHp } from './hit-points';
import {
  CompanionCharacter, currentCharacteristic, skillTotal, damageModifier,
  companionState, maxLocationHp, skillGroups, movementSummary, modifierTotal,
  armourPenalty, fatigueRule, attributeTotal, displayedLocationHp, initializePristineHitPoints, movement,
  changeLocationHp, findTraditionSkill, shapingPointMaximum,
  augmentingBonus, checkThresholds, difficultyStep, DIFFICULTY_STEPS,
  devotionPoolCapacity, theismPoolLimit, theismIntensity, animismMaxSpiritPow, animismSpiritLimit,
  animismSpiritDamage, spiritIntensity, mysticismTotalIntensity, mysticismTalentIntensity,
  mysticismTrainedLimit, sorceryIntensity, sorceryMemoryLimit, folkMagicStartingSpells,
  locationInjuries, setLocationInjuries, magicModifier,
} from './companion-sheet';

describe('Companion sheet / legacy character compatibility', () => {
  function character(): CompanionCharacter {
    return hydrateCharacter({
      id: 'fixture-only-no-real-ids',
      name: 'Test hero',
      height: '165', frame: '10', weight: '66',
      movementRate: 6,
      skills: {str:11,con:11,siz:10,dex:17,int:10,pow:10,cha:11},
      currentValues: {str:11,con:'',ap:3},
      currentHitPoints: {head:5},
      equipment: {head:{ap:5,enc:4,type:'Helmet'},weapons:[],items:[]},
      magic: {folk:[],miracles:[]},
    }) as CompanionCharacter;
  }

  it('uses original fields and leaves the source characteristics untouched', () => {
    const c=character();
    const athletics=c.skills.skills.find(s=>s.name==='Athletics')!;
    const before=skillTotal(c,athletics);
    expect(currentCharacteristic(c,'con')).toBe(11); // blank override is not zero
    expect(currentCharacteristic(c,'str')).toBe(11);
    companionState(c).effects=[{id:'test',name:'Blessing',duration:'1 minute',modifiers:[
      {kind:'characteristic',key:'str',amount:3},
      {kind:'attribute',key:'init',amount:2},
    ]}];
    expect(skillTotal(c,athletics)).toBe(before+3);
    expect(c.skills.str).toBe(11);
    expect(modifierTotal(c,'attribute','init')).toBe(2);
    expect(damageModifier(c)).not.toBe('');
  });

  it('does not turn missing current HP into a full-health save', () => {
    const c=character();
    expect(getCurrentHp(c,'head')).toBe(5);
    expect(getCurrentHp(c,'leftArm')).toBe('');
    expect(maxLocationHp(c,'abdoment')).toBeGreaterThan(0); // legacy spelling kept
    expect(c.currentHitPoints?.leftArm).toBeUndefined();
    expect(displayedLocationHp(c,'leftArm')).toBe(maxLocationHp(c,'leftArm'));
    expect(c.currentHitPoints?.leftArm).toBeUndefined();
  });

  it('fills all hit locations only for genuinely uninitialised characters', () => {
    const c=character();
    expect(initializePristineHitPoints(c)).toBeFalse();
    expect(c.currentHitPoints?.leftArm).toBeUndefined();
    c.currentHitPoints={};
    expect(initializePristineHitPoints(c)).toBeTrue();
    expect(c.currentHitPoints.head).toBe(maxLocationHp(c,'head'));
    expect(c.currentHitPoints.leftArm).toBe(maxLocationHp(c,'leftArm'));
    expect(initializePristineHitPoints(c)).toBeFalse();
    c.currentHitPoints={head:0};
    expect(initializePristineHitPoints(c)).toBeFalse();
    expect(c.currentHitPoints.leftArm).toBeUndefined();
  });

  it('preserves new companion fields and unknown legacy data on round-trip', () => {
    const c=character();
    (c as any).unrecognisedPluginField={tag:'preserve'};
    companionState(c).equipmentNotes='Supplies at camp';
    companionState(c).gifts=[{id:'gift1',name:'Blessing',description:'Permanent gift'}];
    const next=hydrateCharacter(JSON.parse(JSON.stringify(c))) as CompanionCharacter;
    expect(next.companion?.equipmentNotes).toBe('Supplies at camp');
    expect((next as any).unrecognisedPluginField.tag).toBe('preserve');
  });

  it('groups resistances before normal skills without creating duplicates', () => {
    const c=character();
    const groups=skillGroups(c);
    expect(groups[0].name).toBe('Сопротивления');
    expect(groups[0].skills.map(s=>s.name)).toEqual(['Brawn','Endurance','Evade','Willpower']);
    expect(groups[1].skills.some(s=>s.name==='Brawn')).toBeFalse();
  });

  it('subtracts armour and fatigue from Initiative and fatigue from Action Points', () => {
    const c=character();
    const baseInit=attributeTotal(c,'init');
    const baseAP=attributeTotal(c,'ap');
    expect(armourPenalty(c)).toBe(1); // head ENC 4: ceil(4/5)
    expect(baseInit).toBe(13); // ceil((10+17)/2)=14, armour -1
    c.fatigueLevel='Wearied';
    expect(attributeTotal(c,'init')).toBe(baseInit-2);
    expect(attributeTotal(c,'ap')).toBe(baseAP);
    c.fatigueLevel='Exhausted';
    expect(attributeTotal(c,'init')).toBe(baseInit-4);
    expect(attributeTotal(c,'ap')).toBe(baseAP-1);
    c.fatigueLevel='Semi-Conscious';
    expect(attributeTotal(c,'ap')).toBe(0);
    expect(movement(c)).toBe(0);
  });

  it('accepts narrative-only effects and keeps old gift data', () => {
    const c=character();
    companionState(c).gifts=[{id:'legacy',name:'Gift',description:'No numeric bonus'}];
    companionState(c).effects=[{id:'narrative',name:'Fear',duration:'Scene',description:'Cannot enter the shrine.',modifiers:[]}];
    const next=hydrateCharacter(JSON.parse(JSON.stringify(c))) as CompanionCharacter;
    expect(next.companion?.effects?.[0].description).toBe('Cannot enter the shrine.');
    expect(next.companion?.effects?.[0].modifiers.length).toBe(0);
    expect(next.companion?.gifts?.[0].name).toBe('Gift');
  });

  it('applies fatigue movement penalties and half armour penalty to jumps', () => {
    const c=character();
    const fresh=movementSummary(c);
    c.fatigueLevel='Tired';
    const tired=movementSummary(c);
    expect(tired.walking).toBe(fresh.walking-1);
    expect(tired.running).toBeLessThan(fresh.running);
    c.fatigueLevel='Debilitated';
    expect(movementSummary(c).walking).toBe(fresh.walking/2);
    c.fatigueLevel='Incapacitated';
    expect(movementSummary(c).running).toBe(0);
    expect(fatigueRule(c).actionPoints).toBe(-3);
  });

  it('uses the same walking baseline and numeric height as the original viewer', () => {
    const c=character();
    const move=movementSummary(c);
    expect(move.walking).toBe(6);
    expect(move.heightMetres).toBe(1.65);
    expect(move.athletics).toBeGreaterThan(0);
  });

  it('uses the canonical Skill instance for clicking magical skills', () => {
    const c=character();
    const folk=c.skills.skills.find(s=>s.name==='Folk Magic')!;
    expect(findTraditionSkill(c,'Folk Magic')).toBe(folk);
    const chosen=findTraditionSkill(c,'Folk Magic')!;
    expect(skillTotal(c,chosen)).toBe(skillTotal(c,folk));
    expect(findTraditionSkill(c,'NoSuchMagicalSkill')).toBeNull();
  });

  it('changes HP by an arbitrary valid amount, clamps healing, and preserves other locations', () => {
    const c=character();
    const max=maxLocationHp(c,'leftArm');
    const unchangedHead=c.currentHitPoints?.head;
    expect(changeLocationHp(c,'leftArm',-3)).toBe(max-3);
    expect(c.currentHitPoints?.leftArm).toBe(max-3);
    expect(changeLocationHp(c,'leftArm',2)).toBe(max-1);
    expect(changeLocationHp(c,'leftArm',10)).toBe(max);
    expect(changeLocationHp(c,'leftArm',-(max+5))).toBe(-5);
    expect(changeLocationHp(c,'leftArm',Number.NaN)).toBe(-5);
    expect(changeLocationHp(c,'leftArm',0)).toBe(-5);
    expect(c.currentHitPoints?.head).toBe(unchangedHead);
    const roundTripped=hydrateCharacter(JSON.parse(JSON.stringify(c))) as CompanionCharacter;
    expect(roundTripped.currentHitPoints?.leftArm).toBe(-5);
  });
  it('calculates swimming from Swim, honours effects, preview and immobility', () => {
    const c=character();
    const swim=c.skills.skills.find(s=>s.name==='Swim')!;
    const base=skillTotal(c,swim);
    swim.extraBonus=(Number(swim.extraBonus)||0)+40-base;
    expect(movementSummary(c).swimming).toBe(8);
    companionState(c).effects=[{id:'swim',name:'Swim boost',duration:'',modifiers:[{kind:'skill',key:'Swim',amount:20}]}];
    expect(movementSummary(c).swimming).toBe(9);
    expect(movementSummary(c,{}, {swim:20}).swimming).toBe(10);
    expect(movementSummary(c,{str:20}).swimSkill).toBeGreaterThan(movementSummary(c).swimSkill);
    c.fatigueLevel='Tired';
    expect(movementSummary(c).swimming).toBe(8);
    c.fatigueLevel='Incapacitated';
    expect(movementSummary(c).swimming).toBe(0);
  });

  it('rounds shaping capacity up at each ten-percent boundary', () => {
    for(const [skill,expected] of [[0,0],[1,1],[10,1],[11,2],[99,10],[100,10],[101,11],[-10,0],[NaN,0]]) {
      expect(shapingPointMaximum(skill)).withContext(String(skill)).toBe(expected);
    }
  });

  it('prefers a trained magical specialization over its unlearned generic placeholder', () => {
    const c=character();
    const generic=findTraditionSkill(c,'Invocation')!;
    const specific=Object.assign(new Skill('Invocation (Order)',true),generic,{name:'Invocation (Order)',force:true});
    c.skills.specialized.push(specific);
    expect(findTraditionSkill(c,'Invocation')).toBe(specific);
    generic.force=true;
    expect(findTraditionSkill(c,'Invocation')).toBe(generic);
  });

});

describe('Companion sheet / Mythras check and magic formulas', () => {
  function character(): CompanionCharacter {
    return hydrateCharacter({
      id: 'fixture-formulas', name: 'Formula test',
      height: '165', frame: '10', weight: '66', movementRate: 6,
      skills: {str:11,con:11,siz:10,dex:17,int:14,pow:15,cha:13},
      currentValues: {},
      equipment: {head:{ap:5,enc:4,type:'Helmet'},weapons:[],items:[]},
      magic: {folk:[],miracles:[]},
    }) as CompanionCharacter;
  }

  it('applies damage above a temporarily lowered maximum without healing (R1)', () => {
    const c=character();
    expect(maxLocationHp(c,'chest')).toBe(7);
    c.currentHitPoints={chest:12};
    expect(changeLocationHp(c,'chest',-1)).toBe(11); // damage, not clamped to max
    expect(changeLocationHp(c,'chest',10)).toBe(7);  // healing still stops at max
    expect(changeLocationHp(c,'chest',-(maxLocationHp(c,'chest')+5))).toBe(-5);
  });

  it('treats an empty or null armour override as absent, but a real 0 as zero (R3)', () => {
    const c=character();
    expect(armourPenalty(c)).toBe(1); // head ENC 4 → ceil(4/5)
    (c.equipment as any).armorPenalty='';
    expect(armourPenalty(c)).toBe(1);
    (c.equipment as any).armorPenalty=null;
    expect(armourPenalty(c)).toBe(1);
    (c.equipment as any).armorPenalty=0;
    expect(armourPenalty(c)).toBe(0);
    (c.equipment as any).armorPenalty=2;
    expect(armourPenalty(c)).toBe(2);
  });

  it('computes augmenting bonus and thresholds from the book examples (ТЗ §11)', () => {
    expect(augmentingBonus(33)).toBe(7);
    expect(augmentingBonus(5)).toBe(1);
    expect(augmentingBonus(0)).toBe(0);
    expect(augmentingBonus(-5)).toBe(0);
    const standard=difficultyStep('Standard'), hard=difficultyStep('Hard');
    expect(checkThresholds(47,standard)).toEqual({mode:'normal',ordinary:47,critical:5,fumbleFrom:99});
    expect(checkThresholds(40,standard)).toEqual({mode:'normal',ordinary:40,critical:4,fumbleFrom:99});
    expect(checkThresholds(40,hard)).toEqual({mode:'normal',ordinary:27,critical:3,fumbleFrom:99});
    expect(checkThresholds(40,standard,33)).toEqual({mode:'normal',ordinary:47,critical:4,fumbleFrom:99});
    expect(checkThresholds(40,hard,33)).toEqual({mode:'normal',ordinary:32,critical:3,fumbleFrom:99});
    expect(checkThresholds(40,difficultyStep('Very Easy')).ordinary).toBe(80);
    expect(checkThresholds(40,difficultyStep('Easy')).ordinary).toBe(60);
    expect(checkThresholds(40,difficultyStep('Formidable'))).toEqual({mode:'normal',ordinary:20,critical:2,fumbleFrom:99});
    expect(checkThresholds(40,difficultyStep('Herculean'))).toEqual({mode:'normal',ordinary:4,critical:1,fumbleFrom:99});
  });

  it('never caps a skill above 100% and narrows Fumble to 00 only above 100', () => {
    const standard=difficultyStep('Standard');
    expect(checkThresholds(120,standard).ordinary).toBe(120);
    expect(checkThresholds(120,standard).critical).toBe(12);
    expect(checkThresholds(100,standard).fumbleFrom).toBe(99);
    expect(checkThresholds(120,standard).fumbleFrom).toBe(100);
    expect(checkThresholds(120,standard,33).fumbleFrom).toBe(100);
  });

  it('does not produce rollable thresholds for Automatic and Hopeless', () => {
    expect(checkThresholds(40,difficultyStep('Automatic')))
      .toEqual({mode:'automatic',ordinary:null,critical:null,fumbleFrom:null});
    expect(checkThresholds(40,difficultyStep('Hopeless')))
      .toEqual({mode:'hopeless',ordinary:null,critical:null,fumbleFrom:null});
    expect(DIFFICULTY_STEPS.map(step=>step.name))
      .toEqual(['Automatic','Very Easy','Easy','Standard','Hard','Formidable','Herculean','Hopeless']);
  });

  it('matches the Mythras control values for every magic discipline (ТЗ §11)', () => {
    expect(devotionPoolCapacity('Lay Member',15)).toBe(0);
    expect(devotionPoolCapacity('Initiate',15)).toBe(4);
    expect(devotionPoolCapacity('Acolyte',15)).toBe(8);
    expect(devotionPoolCapacity('Priest',15)).toBe(12);
    expect(devotionPoolCapacity('High Priest',15)).toBe(15);
    expect(theismPoolLimit('Priest',10)).toBe(8); // ceil(7.5)=8, within POW
    expect(theismIntensity(63)).toBe(7);
    expect(animismMaxSpiritPow(45)).toBe(15);
    expect(animismSpiritLimit('Follower',13)).toBe(4);
    expect(animismSpiritLimit('Spirit Worshipper',13)).toBe(7);
    expect(animismSpiritLimit('Shaman',13)).toBe(10);
    expect(animismSpiritLimit('High Shaman',13)).toBe(13);
    expect(animismSpiritLimit('Spirit Lord',13)).toBe(13);
    expect(animismSpiritLimit('',13)).toBeNull();
    expect(animismSpiritDamage(20)).toBe('1d2');
    expect(animismSpiritDamage(45)).toBe('1d6');
    expect(animismSpiritDamage(101)).toBe('2d6');
    expect(animismSpiritDamage(300)).toBe('3d10');
    expect(animismSpiritDamage(301)).toBeNull(); // continuation is not specified
    expect(spiritIntensity(6)).toBe(0);
    expect(spiritIntensity(7)).toBe(1);
    expect(spiritIntensity(12)).toBe(1);
    expect(spiritIntensity(13)).toBe(2);
    expect(spiritIntensity(36)).toBe(5);
    expect(spiritIntensity(37)).toBe(6);
    expect(mysticismTalentIntensity(34)).toBe(2);
    expect(mysticismTotalIntensity(66)).toBe(7);
    expect(mysticismTrainedLimit(15)).toBe(8);
    expect(sorceryIntensity(47)).toBe(5);
    expect(shapingPointMaximum(47)).toBe(5);
    expect(sorceryMemoryLimit(12)).toBe(12);
    expect(folkMagicStartingSpells(47)).toBe(3);
  });

  it('stores several wound types per location and reads a legacy single string (ТЗ §5.4)', () => {
    const c=character();
    setLocationInjuries(c,'chest',['Раздроблена']);
    setLocationInjuries(c,'chest',['Раздроблена','Пронзена']);
    expect(locationInjuries(c,'chest')).toEqual(['Раздроблена','Пронзена']);
    expect(locationInjuries(c,'head')).toEqual([]);
    (c.companion as any).injuries={head:'Отсечена'};
    expect(locationInjuries(c,'head')).toEqual(['Отсечена']);
    setLocationInjuries(c,'head',[]);
    expect(locationInjuries(c,'head')).toEqual([]);
    expect((c.companion as any).injuries.head).toBeUndefined();
  });

  it('targets one of two same-named skills when the modifier carries a skill id (R2)', () => {
    const c=character();
    const first=Object.assign(new Skill('Lore',true,'int','pow'),{extraBonus:0,force:true,id:'skill-a'});
    const second=Object.assign(new Skill('Lore',true,'int','pow'),{extraBonus:0,force:true,id:'skill-b'});
    c.skills.specialized.push(first,second);
    const baseA=skillTotal(c,first), baseB=skillTotal(c,second);
    companionState(c).effects=[{id:'targeted',name:'Study',duration:'',
      modifiers:[{kind:'skill',key:'skill-a',amount:5,skillId:'skill-a'}]}];
    expect(skillTotal(c,first)).toBe(baseA+5);
    expect(skillTotal(c,second)).toBe(baseB);
    // A legacy modifier without an id keeps the name-wide behaviour.
    companionState(c).effects=[{id:'legacy',name:'Old effect',duration:'',
      modifiers:[{kind:'skill',key:'Lore',amount:3}]}];
    expect(skillTotal(c,first)).toBe(baseA+3);
    expect(skillTotal(c,second)).toBe(baseB+3);
  });

  it('adds magic-statistic modifiers on top of computed discipline values', () => {
    const c=character();
    companionState(c).effects=[{id:'magic',name:'Blessing',duration:'',
      modifiers:[{kind:'magic',key:'theism.poolMax',amount:2}]}];
    expect(magicModifier(c,'theism.poolMax')).toBe(2);
    expect(magicModifier(c,'sorcery.shapingPoints')).toBe(0);
    expect(theismPoolLimit('Acolyte',15)+magicModifier(c,'theism.poolMax')).toBe(10);
  });
});
