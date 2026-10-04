import { describe, expect, it } from "vitest";
import { abilityMod, type LabeledModifier, stack } from "./stacking";

const m = (
  value: number,
  type: LabeledModifier["type"],
  label: string = type,
): LabeledModifier => ({
  stat: "attack",
  value,
  type,
  label,
});

describe("stack", () => {
  it("dois bônus de moral não somam: vale o maior", () => {
    const r = stack([m(1, "morale", "Bênção"), m(2, "morale", "Canção")]);
    expect(r.total).toBe(2);
    expect(r.parts.find((p) => p.label === "Bênção")?.ignored).toBe(true);
  });

  it("esquiva, sem tipo e circunstância somam", () => {
    expect(stack([m(1, "dodge"), m(1, "dodge"), m(2, "untyped"), m(2, "untyped")]).total).toBe(6);
    expect(stack([m(2, "circumstance"), m(2, "circumstance")]).total).toBe(4);
  });

  it("tipos diferentes somam", () => {
    expect(stack([m(1, "morale"), m(1, "luck"), m(2, "enhancement"), m(1, "sacred")]).total).toBe(
      5,
    );
  });

  it("penalidades sempre somam, mesmo do mesmo tipo", () => {
    expect(
      stack([m(-2, "untyped"), m(-2, "untyped"), m(-1, "morale"), m(-1, "morale")]).total,
    ).toBe(-6);
  });

  it("penalidade não cancela o maior bônus do tipo", () => {
    expect(stack([m(3, "enhancement"), m(-2, "enhancement"), m(1, "enhancement")]).total).toBe(1);
  });

  it("empate mantém o primeiro e soma a base", () => {
    const r = stack([m(2, "morale", "A"), m(2, "morale", "B")], 10);
    expect(r.total).toBe(12);
    expect(r.parts.map((p) => !!p.ignored)).toEqual([false, true]);
  });

  it("ignora zeros", () => {
    expect(stack([m(0, "luck")]).parts).toEqual([]);
  });
});

describe("abilityMod", () => {
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [17, 3],
    [18, 4],
    [30, 10],
  ])("%i → %i", (score, mod) => expect(abilityMod(score)).toBe(mod));
});
