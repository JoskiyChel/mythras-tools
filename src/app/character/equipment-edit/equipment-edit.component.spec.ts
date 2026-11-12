import { EquipmentEditComponent } from './equipment-edit.component';
import { ARMOUR_PRESETS, applyArmourPreset } from '../../services/armour-catalog';
import { Equipment } from '../../model/equipment';

describe('Armour quick selection and detailed editing', () => {
  let component:EquipmentEditComponent;
  beforeEach(() => {component=new EquipmentEditComponent();component.equipment=new Equipment();});

  it('applies a named type with all characteristics, preserving the slot and custom data', () => {
    const slot=component.equipment;
    (slot as any).campaignNote='Heirloom';
    slot.equipped=true;
    component.choosePreset('Half Plate:Hoplite Plate');
    expect(component.equipment).toBe(slot);
    expect(slot.type).toBe('Hoplite Plate');expect(slot.baseMaterial).toBe('Rigid');
    expect(slot.material).toBe('Bronze');expect(slot.construction).toBe('Half Plate');
    expect(slot.ap).toBe(5);expect(slot.enc).toBe(4);expect(slot.cost).toBe(500);
    expect((slot as any).campaignNote).toBe('Heirloom');expect(slot.equipped).toBeTrue();
    expect((slot as any).id).toBeUndefined();
  });

  it('retains manual values when changing modes and applies material multipliers in either mode', () => {
    component.choosePreset('Articulated Plate:Gothic Plate');
    expect(component.equipment.enc).toBe(5.25);
    component.equipment.ap=9;
    const saved=JSON.stringify(component.equipment);
    component.mode='detailed';component.mode='quick';
    expect(JSON.stringify(component.equipment)).toBe(saved);
    component.changedMaterial('Iron');
    expect(component.equipment.enc).toBe(7);
    expect(component.equipment.ap).toBe(9);
    expect(component.selectedPreset).toBe('');
  });

  it('keeps the original sequential workflow and uses the same rule table', () => {
    component.mode='detailed';component.changedBaseMaterial('Flexible');
    component.changedMaterial('Linen');component.changedConstruction('Laminated');
    component.equipment.type='Linothorax';
    const detailed=JSON.stringify(component.equipment);
    component.choosePreset('Laminated:Linothorax');
    expect(JSON.parse(JSON.stringify(component.equipment))).toEqual(JSON.parse(detailed));
    expect(component.getConstructions()).toContain('Scaled');
    expect(component.getTypes()).toContain('Bezainted');
  });

  it('does not modify imported custom armour until a valid preset is selected', () => {
    component.equipment.type='Custom armour';component.equipment.ap=17;
    const before=JSON.stringify(component.equipment);
    expect(component.selectedPreset).toBe('');
    expect(applyArmourPreset(component.equipment,'missing')).toBeFalse();
    expect(JSON.stringify(component.equipment)).toBe(before);
    expect(new Set(ARMOUR_PRESETS.map(p=>p.id)).size).toBe(ARMOUR_PRESETS.length);
  });
});
