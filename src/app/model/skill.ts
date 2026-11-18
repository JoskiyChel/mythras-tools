export type SkillCategory = 'standard' | 'professional' | 'magic';

export class Skill {
    name : string;
    /** Stable identity, assigned only when several skills share one name. */
    id? : string;
    professional : boolean;
    custom?: boolean;
    category?: SkillCategory;
    force : boolean;
    base : string[];
    cultureBonus : number;
    careerBonus : number;
    extraBonus : number;
    fumbleImprovementClaimed?: boolean;
    trainedSinceExperience?: boolean;
    add : number;
    divide : number;
    multiply : number;

    constructor(name: string, professional : boolean, ...base : string[]) {
        this.name = name;
        this.professional = professional;
        this.base = base;
    }

    setOperations(operators : {add? : number, multiply?: number, divide? : number }) : Skill {
        if(operators.add)
            this.add = operators.add;
        if(operators.multiply)
            this.multiply = operators.multiply;
        if(operators.divide)
            this.divide = operators.divide;

        return this;
    }

    setBase(base: string[]): Skill {
        this.base = base;
        return this;
    }
}
