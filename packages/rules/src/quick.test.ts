import { type ClassId, SRD } from "@mesa/srd";
import { SPELLS } from "@mesa/srd/spells";
import { describe, expect, it } from "vitest";
import { deriveCharacter } from "./derive";
import { CLASS_TEMPLATES, quickCharacter, quickLevelUp } from "./quick";
import { validateCharacter } from "./validate";

const classes = Object.keys(CLASS_TEMPLATES) as ClassId[];

describe("quickCharacter", () => {
  it.each(SRD.races.flatMap((r) => classes.map((c) => [r.id, c] as const)))(
    "%s %s nasce válido e com PV cheios",
    (raceId, classId) => {
      const base = quickCharacter({ name: "Teste", raceId, classId }, SRD, SPELLS);
      const r = validateCharacter(base, SRD, SPELLS);
      expect(r.errors).toEqual([]);
      expect(base.hp.current).toBe(r.derived!.hp.total);
      expect(r.derived!.skillPoints.total - r.derived!.skillPoints.spent).toBeLessThanOrEqual(1);
      expect(r.derived!.feats.remaining.general).toBe(0);
    },
  );

  it("guerreiro anão: ataque principal, talentos de guerreiro e equipamento", () => {
    const b = quickCharacter({ name: "Tordek", raceId: "dwarf", classId: "fighter" }, SRD, SPELLS);
    expect(b.feats.map((f) => f.id)).toEqual(
      expect.arrayContaining(["power-attack", "weapon-focus"]),
    );
    expect(b.equipment).toMatchObject({ armorId: "chainmail", shieldId: "shield-heavy-wooden" });
    const d = deriveCharacter(b, [], SRD);
    expect(d.attacks[0]!.name).toBe("Espada Longa");
  });

  it("conjuradores vêm com magias", () => {
    const sorc = quickCharacter({ name: "S", raceId: "human", classId: "sorcerer" }, SRD, SPELLS);
    expect(sorc.spells.sorcerer!.known).toHaveLength(6); // 4 truques + 2 de 1º
    const cleric = quickCharacter({ name: "C", raceId: "human", classId: "cleric" }, SRD, SPELLS);
    expect(cleric.domains).toEqual(["healing", "protection"]);
    expect(cleric.spells.cleric!.prepared[1]).toContain("cure-light-wounds");
    const wiz = quickCharacter({ name: "W", raceId: "elf", classId: "wizard" }, SRD, SPELLS);
    expect(wiz.spells.wizard!.known).toContain("magic-missile");
  });
});

describe("quickLevelUp", () => {
  it.each(classes)("%s sobe do 1 ao 20 sempre válido", (classId) => {
    let b = quickCharacter({ name: "T", raceId: "human", classId }, SRD, SPELLS);
    for (let lvl = 2; lvl <= 20; lvl++) {
      const before = b.hp.current;
      b = quickLevelUp(b, SRD, SPELLS);
      const r = validateCharacter(b, SRD, SPELLS);
      expect(r.errors, `nível ${lvl}`).toEqual([]);
      expect(b.levels).toHaveLength(lvl);
      expect(b.hp.current).toBeGreaterThan(before);
    }
    expect(quickLevelUp(b, SRD, SPELLS)).toBe(b);
  });

  it("multiclasse: sobe na classe pedida", () => {
    const b = quickLevelUp(
      quickCharacter({ name: "T", raceId: "human", classId: "fighter" }, SRD, SPELLS),
      SRD,
      SPELLS,
      "wizard",
    );
    expect(b.levels.map((l) => l.classId)).toEqual(["fighter", "wizard"]);
    expect(validateCharacter(b, SRD, SPELLS).errors).toEqual([]);
  });
});
