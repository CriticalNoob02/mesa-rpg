import { describe, expect, it } from "vitest";
import { SRD } from "./index";
import { SPELLS } from "./spells";
import { ABILITIES } from "./types";

const skillIds = new Set(SRD.skills.map((s) => s.id));
const skillParents = new Set(SRD.skills.map((s) => s.parent).filter(Boolean));

describe("SRD gerado", () => {
  it("tem as 11 classes base com 20 níveis", () => {
    expect(SRD.classes.map((c) => c.id).sort()).toEqual([
      "barbarian",
      "bard",
      "cleric",
      "druid",
      "fighter",
      "monk",
      "paladin",
      "ranger",
      "rogue",
      "sorcerer",
      "wizard",
    ]);
    for (const c of SRD.classes) {
      expect(c.levels.map((l) => l.level)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    }
  });

  it("confere linhas conhecidas do Livro do Jogador", () => {
    const fighter = SRD.classes.find((c) => c.id === "fighter")!;
    expect(fighter).toMatchObject({ hitDie: 10, skillPoints: 2 });
    expect(fighter.levels[19]).toMatchObject({ bab: 20, fort: 12, ref: 6, will: 6 });
    const wizard = SRD.classes.find((c) => c.id === "wizard")!;
    expect(wizard.levels[19]).toMatchObject({ bab: 10, will: 12 });
    expect(wizard.levels[0]!.slots).toEqual([3, 1, null, null, null, null, null, null, null, null]);
    const cleric = SRD.classes.find((c) => c.id === "cleric")!;
    expect(cleric.levels[4]!.slots!.slice(0, 4)).toEqual([5, 3, 2, 1]);
    expect(cleric.levels[4]!.domainSlots!.slice(0, 4)).toEqual([0, 1, 1, 1]);
    const sorcerer = SRD.classes.find((c) => c.id === "sorcerer")!;
    expect(sorcerer.levels[0]!.known!.slice(0, 2)).toEqual([4, 2]);
    const paladin = SRD.classes.find((c) => c.id === "paladin")!;
    expect(paladin.levels[2]!.slots).toBeNull();
    expect(paladin.levels[3]!.slots![1]).toBe(0);
    const monk = SRD.classes.find((c) => c.id === "monk")!;
    expect(monk.levels[4]!.monk).toMatchObject({
      acBonus: 1,
      speedBonus: 10,
      unarmedDamage: "1d8",
    });
  });

  it("perícias de classe existem", () => {
    for (const c of SRD.classes) {
      for (const id of c.classSkills) expect(skillIds.has(id) || skillParents.has(id)).toBe(true);
    }
  });

  it("modificadores das raças apontam para atributos/perícias válidos", () => {
    expect(SRD.races).toHaveLength(7);
    for (const r of SRD.races) {
      for (const k of Object.keys(r.abilityAdjustments)) expect(ABILITIES).toContain(k);
      for (const m of r.modifiers) {
        if (m.stat.startsWith("skill.")) expect(skillIds.has(m.stat.slice(6))).toBe(true);
      }
    }
  });

  it("condições também", () => {
    for (const c of SRD.conditions) {
      for (const m of c.modifiers) {
        if (m.stat.startsWith("skill.") && m.stat !== "skill.all") {
          expect(skillIds.has(m.stat.slice(6))).toBe(true);
        }
      }
    }
  });

  it("talentos, armas e armaduras básicos", () => {
    const power = SRD.feats.find((f) => f.id === "power-attack")!;
    expect(power).toMatchObject({ prerequisite: "Str 13" });
    expect(power.types).toContain("Fighter");
    expect(SRD.feats.find((f) => f.id === "toughness")).toMatchObject({
      multiple: true,
      stack: true,
    });
    expect(SRD.weapons.find((w) => w.id === "longsword")).toMatchObject({
      proficiency: "martial",
      handedness: "one-handed",
      critical: { range: 19, multiplier: 2 },
    });
    expect(SRD.armor.find((a) => a.id === "full-plate")).toMatchObject({
      kind: "heavy",
      bonus: 8,
      maxDex: 1,
      checkPenalty: -6,
      speed30: 20,
    });
  });

  it("magias com listas e domínios resolvidos", () => {
    const fireball = SPELLS.find((s) => s.id === "fireball")!;
    expect(fireball.levels).toEqual({ "Sorcerer/Wizard": 3 });
    const ids = new Set(SPELLS.map((s) => s.id));
    const resolved = SRD.domains.flatMap((d) => d.spells).filter((s) => s.id);
    expect(resolved.every((s) => ids.has(s.id!))).toBe(true);
    expect(resolved.length).toBeGreaterThan(300);
  });
});
