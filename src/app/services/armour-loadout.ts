import { Character } from '../model/character';
import { CharacterEquipment, SpareArmour } from '../model/character-equipment';
import { Equipment } from '../model/equipment';
import { getButArmor } from './character-service.service';
import { HIT_LOCATION_ORDER, HitLocation } from './hit-locations';

export function hasArmour(piece: Equipment | undefined): piece is Equipment {
  return !!piece && Boolean(piece.name || piece.type || piece.construction || Number(piece.ap) || Number(piece.enc));
}

export function armourLabel(piece: Equipment): string {
  return piece.name || [piece.material, piece.type || piece.construction].filter(Boolean).join(' ') || 'Пользовательская броня';
}

export function spareArmour(equipment: CharacterEquipment): SpareArmour[] {
  return Array.isArray(equipment.spareArmour) ? equipment.spareArmour : [];
}

export function canCarryArmour(piece: Equipment): boolean {
  return hasArmour(piece) && [piece.ap, piece.enc, piece.cost].every(value =>
    value == null || (Number.isFinite(Number(value)) && Number(value) >= 0));
}

export function carryArmour(character: Character, location: HitLocation, piece: Equipment): boolean {
  if (!canCarryArmour(piece)) return false;
  const equipment = character.equipment;
  equipment.spareArmour = [...spareArmour(equipment), {location, piece: {...piece, equipped: false}}];
  return true;
}

export function changeWornArmour(character: Character, location: HitLocation, chosen: SpareArmour | null): boolean {
  const equipment = character.equipment;
  const carried = spareArmour(equipment);
  const worn = equipment[location];
  if (chosen ? chosen.location !== location || !carried.includes(chosen) : !hasArmour(worn)) return false;
  const remaining = carried.filter(entry => entry !== chosen);
  if (hasArmour(worn)) remaining.push({location, piece: {...worn, equipped: false}});
  equipment.spareArmour = remaining;
  equipment[location] = chosen ? {...chosen.piece, equipped: true} : new Equipment();
  return true;
}

export function wornArmourLoad(character: Character): number {
  return HIT_LOCATION_ORDER.reduce((sum, location) => sum + (Number(character.equipment[location]?.enc) || 0), 0);
}

export function armourLoad(character: Character) {
  const gear = getButArmor(character, 'enc');
  const worn = wornArmourLoad(character);
  return {gear, worn, total: gear + worn / 2};
}
