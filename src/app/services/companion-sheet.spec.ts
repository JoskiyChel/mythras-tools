import { hydrateCharacter } from './character-format';
import { getCurrentHp } from './hit-points';
import {
  CompanionCharacter, currentCharacteristic, skillTotal, damageModifier,
  companionState, maxLocationHp, skillGroups, movementSummary, modifierTotal,
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

  it('uses the same walking baseline and numeric height as the original viewer', () => {
    const c=character();
    const move=movementSummary(c);
    expect(move.walking).toBe(6);
    expect(move.heightMetres).toBe(1.65);
    expect(move.athletics).toBeGreaterThan(0);
  });
});
