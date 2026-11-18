import { MysticPath } from './mystic-path';
import { Spell } from './spell';
export interface SpiritRecord {
    name: string;
    state: 'known' | 'bound';
    vessel: string;
    abilities: string;
    resources: string;
}

export class CharacterMagic {
    folk : Spell[] = [];
    sorcery : Spell[] = [];
    miracles : Spell[] = [];
    spirits : string;
    spiritRecords?: SpiritRecord[];
    path : MysticPath = new MysticPath();

    abilities : string;
    custom: Spell[] = [];

}