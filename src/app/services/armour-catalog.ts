import { Equipment } from '../model/equipment';

export const ARMOUR_BASE_MATERIALS : Record<string, string[]> = {
  "Flexible" : [
    "Natural/Cured",
    "Padded/Quilted",
    "Laminated",
    "Scaled"
  ],
  "Rigid" : [
    "Half Plate",
    "Mail",
    "Plated Mail",
    "Articulated Plate"
  ]
}

export const ARMOUR_MATERIALS : Record<string, number> = {
  "Bone" : 1.5,
  "Bronze" : 1,
  "Chitin" : 0.75,
  "Iron" : 1,
  "Ivory" : 1.25,
  "Leather" : 2,
  "Linen" : 1,
  "Shell" : 2,
  "Silk" : 0.75,
  "Steel" : 0.75,
  "Stone" : 3
}

export const ARMOUR_CONSTRUCTIONS : Record<string, {types:string[];ap:number;enc:number;cost:number}> = {
  "Natural/Cured" : {
    types: [
      "Furs", "Hides"
    ],
    ap: 1,
    enc: 2,
    cost: 20
  },
  "Padded/Quilted" : {
    types: [
      "Aketon", "Gambeson"
    ],
    ap: 2,
    enc: 1,
    cost: 80
  },
  "Laminated" : {
    types: [
      "Linothorax", "Bezainted"
    ],
    ap: 3,
    enc: 2,
    cost: 180
  },
  "Scaled" : {
    types: [
      "Brigandine", "Lamellar"
    ],
    ap: 4,
    enc: 3,
    cost: 320
  },

  "Half Plate" : {
    types: [
      "Hoplite Plate"
    ],
    ap: 5,
    enc: 4,
    cost: 500
  },
  "Mail" : {
    types: [
      "Mail Hauberk", "Laminar"
    ],
    ap: 6,
    enc: 5,
    cost: 900
  },
  "Plated Mail" : {
    types: [
      "Splinted Chainmail"
    ],
    ap: 7,
    enc: 6,
    cost: 1400
  },
  "Articulated Plate" : {
    types: [
      "Gothic Plate"
    ],
    ap: 8,
    enc: 7,
    cost: 2400
  },

}


export interface ArmourPreset {
  id:string; type:string; baseMaterial:string; material:string;
  construction:string; ap:number; enc:number; cost:number;
}
// Named examples use the existing construction table and material multipliers.
// The material is visible before selection; both modes remain freely editable.
const DEFAULT_MATERIAL:Record<string,string> = {
  'Natural/Cured':'Leather', 'Padded/Quilted':'Linen', 'Laminated':'Linen',
  'Scaled':'Bronze', 'Half Plate':'Bronze', 'Mail':'Iron',
  'Plated Mail':'Iron', 'Articulated Plate':'Steel',
};
export const ARMOUR_PRESETS:readonly ArmourPreset[] = Object.entries(ARMOUR_CONSTRUCTIONS)
  .flatMap(([construction,rule]) => rule.types.map(type => {
    const material=DEFAULT_MATERIAL[construction];
    return {id:construction+':'+type,type,construction,material,
      baseMaterial:Object.keys(ARMOUR_BASE_MATERIALS).find(key=>ARMOUR_BASE_MATERIALS[key].includes(construction))!,
      ap:rule.ap,enc:rule.enc*ARMOUR_MATERIALS[material],cost:rule.cost};
  }));
export function applyArmourPreset(equipment:Equipment,id:string):boolean {
  const preset=ARMOUR_PRESETS.find(item=>item.id===id);
  if(!preset)return false;
  const {id:catalogId,...fields}=preset;
  Object.assign(equipment,fields);
  return true;
}
