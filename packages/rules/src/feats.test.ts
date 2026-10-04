import { SRD } from "@mesa/srd";
import { describe, expect, it } from "vitest";
import { checkPrerequisites, type PrereqContext } from "./feats";

const ctx = (over: Partial<PrereqContext> = {}): PrereqContext => ({
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  bab: 0,
  totalLevel: 1,
  classLevels: {},
  casterLevel: 0,
  skillRanks: {},
  feats: [],
  isProficient: () => true,
  ...over,
});
const feat = (id: string) => SRD.feats.find((f) => f.id === id)!;
const results = (id: string, c: PrereqContext, choice?: string) =>
  checkPrerequisites(feat(id), choice, c, SRD).map((r) => r.ok);

describe("checkPrerequisites", () => {
  it("nível de conjurador, graduações e nível de personagem", () => {
    expect(results("craft-wondrous-item", ctx({ casterLevel: 2 }))).toEqual([false]);
    expect(results("craft-wondrous-item", ctx({ casterLevel: 3 }))).toEqual([true]);
    expect(results("mounted-combat", ctx({ skillRanks: { ride: 1 } }))).toEqual([true]);
    expect(results("leadership", ctx({ totalLevel: 6 }))).toEqual([true]);
  });

  it("expulsar mortos-vivos e forma selvagem", () => {
    expect(results("extra-turning", ctx({ classLevels: { cleric: 1 } }))).toEqual([true]);
    expect(results("extra-turning", ctx({ classLevels: { paladin: 3 } }))).toEqual([false]);
    expect(
      results(
        "natural-spell",
        ctx({ abilities: { ...ctx().abilities, wis: 13 }, classLevels: { druid: 5 } }),
      ),
    ).toEqual([true, true]);
  });

  it("talento com escola entre parênteses e talento concedido pela classe", () => {
    expect(
      results("augment-summoning", ctx({ feats: [{ id: "spell-focus", choice: "conjuration" }] })),
    ).toEqual([true]);
    expect(
      results("augment-summoning", ctx({ feats: [{ id: "spell-focus", choice: "evocation" }] })),
    ).toEqual([false]);
    expect(results("diehard", ctx({ classLevels: { ranger: 3 } }))).toEqual([true]);
  });

  it("pré-requisito que o motor não avalia vira null", () => {
    expect(results("improved-familiar", ctx())).toContain(null);
    expect(checkPrerequisites(feat("alertness"), undefined, ctx(), SRD)).toEqual([]);
  });
});
