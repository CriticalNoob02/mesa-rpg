import { type CharacterBase, emptyCharacter } from "@mesa/rules";

export const tordek = (over: Partial<CharacterBase> = {}): CharacterBase => ({
  ...emptyCharacter(),
  name: "Tordek",
  raceId: "dwarf",
  alignment: "LN",
  abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
  levels: [{ classId: "fighter", hp: 10 }],
  skills: { climb: 2, jump: 2 },
  feats: [{ id: "power-attack" }, { id: "cleave" }],
  equipment: {
    armorId: "scale-mail",
    shieldId: "shield-heavy-wooden",
    weapons: ["waraxe-dwarven"],
    gear: [],
  },
  hp: { current: 13, nonlethal: 0, temp: 0 },
  ...over,
});
