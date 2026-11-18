import { advancementSkills, applyAdvancement, experienceBalance, experienceImprovement, trainingExpression, trainingPrice, trainingShift } from './character-advancement';
import { hydrateCharacter, parseCharacterFile } from './character-format';
import { getSkillTotal } from './character-service.service';
import { CompanionCharacter, skillTotal } from './companion-sheet';

describe('Character advancement', () => {
  const hero = () => hydrateCharacter({ name:'Hero', skills:{str:12,dex:12,int:12,con:12,siz:12,pow:12,cha:12},
    currentValues:{str:15}, currentHitPoints:{head:0}, extension:{tag:'keep'} });
  const athletics = (character: ReturnType<typeof hero>) => advancementSkills(character).find(option => option.skill.name === 'Athletics')!;

  it('uses d100 + INT and awards the larger improvement at equality (Core Rules p. 72)', () => {
    expect(experienceImprovement(50, 12, 37)).toBe(1);
    expect(experienceImprovement(50, 12, 38)).toBeUndefined();
    expect(experienceImprovement(50, 12, 38, 4)).toBe(5);
    expect(experienceImprovement(50, 12, 0, 4)).toBeUndefined();
  });

  it('charges once, keeps effects and current HP separate, and leaves the original intact (p. 72)', () => {
    const character = hero();
    const { skill, address } = athletics(character);
    const score = getSkillTotal(character, skill);
    const companion = character as CompanionCharacter;
    companion.companion = {effects:[{id:'stat', name:'Strength', duration:'',
      modifiers:[{kind:'characteristic',key:'str',amount:4}]}]};
    const result = applyAdvancement(character, [{kind:'award',rolls:1,modifier:0},{kind:'experience',skill:address,d100:score-12,d4:2}]);
    expect(experienceBalance(result)).toBe(0);
    expect(getSkillTotal(result, athletics(result).skill)).toBe(score + 3);
    expect(skillTotal(result, athletics(result).skill)).toBe(score + 10);
    expect(getSkillTotal(character, skill)).toBe(score);
    expect(result.currentHitPoints?.['head']).toBe(0);
    expect(() => applyAdvancement(result,[{kind:'experience',skill:address,d100:100,d4:4}])).toThrow();
  });

  it('keeps failed batches atomic and round-trips the counter and current values', () => {
    const character = hero();
    const address = athletics(character).address;
    expect(() => applyAdvancement(character,[{kind:'regime',key:'str',steps:1,maximum:18},
      {kind:'experience',skill:address,d100:100,d4:4}])).toThrow();
    expect(character.skills.str).toBe(12);
    const result = applyAdvancement(character,[{kind:'balance',delta:10000},{kind:'balance',delta:-1},
      {kind:'permanent',key:'str',minimum:12,maximum:18}]);
    const saved = parseCharacterFile(JSON.stringify(result))[0] as CompanionCharacter & {extension:{tag:string}};
    expect(saved.skills.str).toBe(13);
    expect(saved.currentValues?.['str']).toBe(16);
    expect(experienceBalance(saved)).toBe(9998);
    expect(saved.extension).toEqual({tag:'keep'});
    expect(() => applyAdvancement(saved,[{kind:'balance',delta:-9999}])).toThrow();
    expect(() => applyAdvancement(saved,[{kind:'balance',delta:-0.5}])).toThrow();
  });

  it('allows one claim for a fumbled skill per award period (p. 72)', () => {
    const character = hero();
    const address = athletics(character).address;
    const action = {kind:'fumble' as const,skill:address};
    expect(() => applyAdvancement(character,[action])).toThrow();
    const result = applyAdvancement(character,[{kind:'award',rolls:1,modifier:0}, action]);
    expect(() => applyAdvancement(result,[action])).toThrow();
    expect(experienceBalance(result)).toBe(1);
  });

  it('requires a source and month for a new professional skill and charges three ER (p. 73)', () => {
    const character = applyAdvancement(hero(),[{kind:'award',rolls:3,modifier:0}]);
    const unlearned = advancementSkills(character).find(option => option.skill.name === 'Shaping')!;
    expect(() => applyAdvancement(character,[{kind:'learn',skill:unlearned.address,source:'Tutor',month:''}])).toThrow();
    const result = applyAdvancement(character,[{kind:'learn',skill:unlearned.address,source:'Tutor',month:'First month completed'}]);
    const learned = advancementSkills(result).find(option => option.skill.name === 'Shaping')!;
    expect(learned.learned).toBeTrue();
    expect(getSkillTotal(result,learned.skill)).toBe(24);
    expect(experienceBalance(result)).toBe(0);
  });

  it('changes a recorded passion by the skill procedure (p. 72)', () => {
    const character = hero();
    character.passions = [{passion:'Loyalty',modifierNumber:50} as typeof character.passions[number]];
    const result = applyAdvancement(character,[{kind:'award',rolls:2,modifier:0},
      {kind:'passion',index:0,d100:38,d4:2},{kind:'passion',index:0,d100:1,reduce:true}]);
    expect(result.passions[0].modifierNumber).toBe(52);
    expect(character.passions[0].modifierNumber).toBe(50);
    expect(experienceBalance(result)).toBe(0);
  });

  it('covers training chart rows, Teach shifts and the price example (p. 73; Tennla uses d2 at 20)', () => {
    expect([19,20,21,30,31,41,51,61,91,101].map(difference => trainingExpression(difference)))
      .toEqual([undefined,'d2','d2','d2','d3','d4','d6','d6+1','d6+4','d6+5']);
    expect(trainingExpression(20,-1)).toBe('0');
    expect(trainingShift(50,5)).toBe(2);
    expect(trainingShift(50,24)).toBe(1);
    expect(trainingShift(50,55)).toBe(0);
    expect(trainingShift(50,100)).toBe(-1);
    expect(trainingPrice(70,50)).toBe(19);
  });

  it('registers a week without a gain, completes once, and unlocks retraining only through ER (p. 73)', () => {
    const character = hero();
    const { address, skill } = athletics(character);
    const total = getSkillTotal(character,skill);
    const start = {kind:'startTraining' as const,training:{skill:address,mentor:'Mentor',mentorSkill:total + 20,period:'Week 1',terms:'Favor'}};
    const planned = applyAdvancement(character,[start]);
    expect(getSkillTotal(planned,athletics(planned).skill)).toBe(total);
    expect(() => applyAdvancement(planned,[start])).toThrow();
    const result = applyAdvancement(planned,[{kind:'finishTraining',week:'Week 1 completed',die:2}]);
    expect(getSkillTotal(result,athletics(result).skill)).toBe(total + 2);
    expect(experienceBalance(result)).toBe(0);
    expect(() => applyAdvancement(result,[{kind:'finishTraining',week:'Week 1 completed',die:2}])).toThrow();
    expect(() => applyAdvancement(result,[start])).toThrow();
    const improved = applyAdvancement(result,[{kind:'award',rolls:1,modifier:0},{kind:'experience',skill:address,d100:1}]);
    expect(athletics(improved).skill.trainedSinceExperience).toBeUndefined();
  });

  it('uses ongoing upkeep and award-triggered decline, and separates the optional purchase (pp. 72–73)', () => {
    const character = hero();
    const started = applyAdvancement(character,[{kind:'regime',key:'str',steps:1,maximum:18},{kind:'award',rolls:3,modifier:0}]);
    expect(started.skills.str).toBe(13);
    expect(experienceBalance(started)).toBe(2);
    const stopped = applyAdvancement(started,[{kind:'regime',key:'str',steps:0,maximum:18}]);
    expect(stopped.skills.str).toBe(13);
    const awarded = applyAdvancement(stopped,[{kind:'award',rolls:10,modifier:0}]);
    expect(awarded.skills.str).toBe(12);
    const paid = applyAdvancement(awarded,[{kind:'permanent',key:'dex',minimum:3,maximum:18}]);
    expect(paid.skills.dex).toBe(13);
    expect(experienceBalance(paid)).toBe(2);
    expect(() => applyAdvancement(character,[{kind:'regime',key:'siz',steps:1,maximum:18}])).toThrow();
  });

  it('records a learned magical ability once at the agreed cost', () => {
    const character = hero();
    const learn = {kind:'magic' as const,tradition:'folk' as const,name:'Light',description:'A light',
      rolls:3,study:'One week'};
    const result = applyAdvancement(character,[{kind:'balance',delta:6},learn]);
    expect(result.magic.folk).toContain(jasmine.objectContaining({name:'Light'}));
    expect(experienceBalance(result)).toBe(3);
    expect(() => applyAdvancement(result,[learn])).toThrow();
  });
});
