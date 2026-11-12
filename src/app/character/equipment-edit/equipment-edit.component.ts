import { Equipment } from './../../model/equipment';
import { Component, Input } from '@angular/core';
import { ARMOUR_PRESETS, ARMOUR_BASE_MATERIALS as baseMaterials, ARMOUR_CONSTRUCTIONS as constructions, ARMOUR_MATERIALS as materials, applyArmourPreset } from '../../services/armour-catalog';
import { resetObject } from 'src/app/services/common.service';

@Component({
  selector: 'equipment',
  templateUrl: './equipment-edit.component.html',
  styleUrls: ['./equipment-edit.component.scss']
})
export class EquipmentEditComponent {

  @Input() equipment : Equipment;
  mode:'quick'|'detailed'='quick';
  readonly presets=ARMOUR_PRESETS;
  get selectedPreset():string {
    return this.presets.find(p=>p.type===this.equipment.type && p.material===this.equipment.material && p.construction===this.equipment.construction)?.id||'';
  }
  choosePreset(id:string):void { applyArmourPreset(this.equipment,id); }


  changedBaseMaterial(base : string) : void {
    resetObject(this.equipment);
    this.equipment.baseMaterial = base;
  }

  changedMaterial(material : string) : void {
    this.equipment.material = material;
    if(this.equipment.construction)
      this.equipment.enc = constructions[this.equipment.construction].enc*materials[this.equipment.material];
  }

  getMaterials() : string[] {
    return Object.keys(materials);
  }

  getTypes() : string[] {
    if(!this.equipment.construction)
      return [];
    return constructions[this.equipment.construction].types;
  }

  changedConstruction(construction : string) : void {
    this.equipment.construction = construction;
    this.equipment.type = constructions[construction].types[0];
    this.equipment.ap = constructions[construction].ap;
    // this.equipment.hp = this.getHpFromConstruction();
    this.equipment.enc = constructions[construction].enc*(this.equipment.material?materials[this.equipment.material]:1);
    this.equipment.cost = constructions[construction].cost;
  }

  getConstructions() : string[] {
    if(!this.equipment.baseMaterial)
      return Object.keys(constructions);
    return baseMaterials[this.equipment.baseMaterial];
  }

}
