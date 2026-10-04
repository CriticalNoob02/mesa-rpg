import { describe, expect, it } from "vitest";
import { SRD } from "./index";
import { SPELLS } from "./spells";

const imperial = /\b\d+(?:[.,]\d+)?\s*(?:ft\.?|feet|lb\.?|lbs\.?|miles?|gp)\b/i;

describe("tradução para português", () => {
  it("toda magia tem nome, resumo, descrição e campos curtos em português", () => {
    const sem = SPELLS.filter((s) => !s.pt?.name || !s.pt.description).map((s) => s.id);
    expect(sem).toEqual([]);
    for (const s of SPELLS) {
      expect(s.pt!.range, s.id).not.toMatch(imperial);
      expect(s.pt!.components, s.id).not.toMatch(/\bS\b/);
    }
  });

  it("talentos, equipamento, domínios e classes traduzidos", () => {
    expect(SRD.feats.filter((f) => !f.namePt || !f.benefitPt).map((f) => f.id)).toEqual([]);
    expect(SRD.weapons.filter((w) => !w.namePt).map((w) => w.id)).toEqual([]);
    expect(SRD.armor.filter((a) => !a.namePt).map((a) => a.id)).toEqual([]);
    expect(SRD.gear.filter((g) => !g.namePt).map((g) => g.id)).toEqual([]);
    expect(SRD.domains.filter((d) => !d.namePt || !d.grantedPowersPt).map((d) => d.id)).toEqual([]);
    expect(SRD.classes.filter((c) => !c.proficienciesPt).map((c) => c.id)).toEqual([]);
  });

  it("pré-requisito traduzido tem as mesmas cláusulas", () => {
    for (const f of SRD.feats) {
      if (!f.prerequisite) continue;
      expect(f.prerequisitePt?.split(/,\s*/).length, f.id).toBe(
        f.prerequisite.split(/,\s*/).length,
      );
    }
  });

  it("nomes já usados no app batem com a tradução", () => {
    const spell = (id: string) => SPELLS.find((s) => s.id === id)!.pt!.name;
    expect(spell("fireball")).toBe("Bola de Fogo");
    expect(spell("bless")).toBe("Bênção");
    expect(spell("shield-of-faith")).toBe("Escudo da Fé");
    expect(SRD.feats.find((f) => f.id === "power-attack")!.namePt).toBe("Ataque Poderoso");
    expect(SRD.weapons.find((w) => w.id === "longsword")!.namePt).toBe("Espada Longa");
  });
});
