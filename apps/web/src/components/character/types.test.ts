import { describe, expect, it } from "vitest";
import { groupSpecials } from "./CharacterSheet";
import { stepOf } from "./types";

describe("stepOf", () => {
  it.each([
    ["name", "race"],
    ["abilities.str", "abilities"],
    ["levels.0.hp", "class"],
    ["abilityIncreases", "class"],
    ["skills.climb", "skills"],
    ["feats.1", "feats"],
    ["equipment.gear.0", "equipment"],
    ["domains", "spells"],
    ["spells.wizard", "spells"],
    ["hp.current", "review"],
    ["", "review"],
  ])("%s → %s", (path, key) => expect(stepOf({ path, message: "" })).toBe(key));
});

describe("groupSpecials", () => {
  it("junta repetidas com os níveis", () => {
    expect(
      groupSpecials([
        { classId: "fighter", level: 1, text: "Bonus feat" },
        { classId: "fighter", level: 2, text: "Bonus feat" },
        { classId: "rogue", level: 1, text: "Sneak attack +1d6" },
      ]),
    ).toEqual([
      { text: "Bonus feat", count: 2, levels: "Guerreiro 1, Guerreiro 2" },
      { text: "Sneak attack +1d6", count: 1, levels: "Ladino 1" },
    ]);
  });
});
