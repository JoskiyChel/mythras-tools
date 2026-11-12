import { Skill } from '../model/skill';
import { hydrateCharacter } from './character-format';
import { getCurrentHp } from './hit-points';
import {
  CompanionCharacter, currentCharacteristic, skillTotal, damageModifier,
  companionState, maxLocationHp, skillGroups, movementSummary, modifierTotal,
  armourPenalty, fatigueRule, attributeTotal, displayedLocationHp, initializePristineHitPoints, movement,
  changeLocationHp, findTraditionSkill, shapingPointMaximum,
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
