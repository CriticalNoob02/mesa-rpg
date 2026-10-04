import { describe, expect, it } from "vitest";
import {
  damageExpr,
  deriveNpc,
  emptyNpcStats,
  hpState,
  parseCritical,
  resolveAttack,
  sortInitiative,
} from "./combat";

const seq =
  (...values: number[]) =>
  () => {
    const v = values.shift();
    if (v === undefined) throw new Error("sequência acabou");
    return v;
  };
const base = { bonus: 5, targetAc: 15, critRange: 19, critMultiplier: 2, damage: "1d8+3" };

describe("resolveAttack", () => {
  it("acerto normal rola dano uma vez", () => {
    const r = resolveAttack(base, seq(12, 6));
    expect(r).toMatchObject({
      natural: 12,
      total: 17,
      hit: true,
      threat: false,
      critical: false,
      damage: 9,
    });
    expect(r.confirm).toBeNull();
  });

  it("erro não rola dano", () => {
    const r = resolveAttack(base, seq(4));
    expect(r).toMatchObject({ hit: false, damage: 0, damageRolls: [] });
  });

  it("1 natural erra mesmo passando da CA; 20 natural acerta sempre", () => {
    expect(resolveAttack({ ...base, bonus: 30 }, seq(1)).hit).toBe(false);
    expect(resolveAttack({ ...base, bonus: -10, critRange: 21 }, seq(20, 1)).hit).toBe(true);
  });

  it("ameaça confirmada multiplica (rola o dano N vezes)", () => {
    const r = resolveAttack({ ...base, critMultiplier: 3 }, seq(19, 15, 2, 4, 8));
    expect(r.threat).toBe(true);
    expect(r.confirm).toMatchObject({ natural: 15, total: 20, confirmed: true });
    expect(r.critical).toBe(true);
    expect(r.damageRolls.map((d) => d.total)).toEqual([5, 7, 11]);
    expect(r.damage).toBe(23);
  });

  it("ameaça não confirmada vira acerto normal", () => {
    const r = resolveAttack(base, seq(19, 2, 5));
    expect(r).toMatchObject({ threat: true, critical: false, damage: 8 });
    expect(r.confirm?.confirmed).toBe(false);
  });

  it("ameaça só acontece se o ataque acerta", () => {
    expect(resolveAttack({ ...base, bonus: -10 }, seq(19)).threat).toBe(false);
  });

  it("dano mínimo 1", () => {
    expect(resolveAttack({ ...base, damage: "1d4-5" }, seq(15, 1)).damage).toBe(1);
  });
});

describe("auxiliares", () => {
  it("expressão de dano e crítico", () => {
    expect(damageExpr("1d8", 3)).toBe("1d8+3");
    expect(damageExpr("2d6", -1)).toBe("2d6-1");
    expect(damageExpr("1d4", 0)).toBe("1d4");
    expect(parseCritical("19-20/x2")).toEqual({ range: 19, multiplier: 2 });
    expect(parseCritical("x3")).toEqual({ range: 20, multiplier: 3 });
  });

  it("iniciativa: total, depois bônus, depois ordem dada", () => {
    const r = sortInitiative([
      { id: "a", bonus: 1, roll: 10 },
      { id: "b", bonus: 3, roll: 8 },
      { id: "c", bonus: 0, roll: 15 },
      { id: "d", bonus: 3, roll: 8 },
    ]);
    expect(r.map((x) => `${x.id}${x.total}`)).toEqual(["c15", "b11", "d11", "a11"]);
  });

  it("NPC com efeitos: CA, toque, surpreso e ataque", () => {
    const d = deriveNpc(
      {
        ...emptyNpcStats(),
        ac: 15,
        touch: 11,
        flatFooted: 14,
        attacks: [{ name: "Clava", bonus: 2, damage: "1d6+1", critical: "x2" }],
      },
      [
        { sourceName: "Escudo da Fé", modifiers: [{ stat: "ac", value: 2, type: "deflection" }] },
        {
          sourceName: "Velocidade",
          modifiers: [
            { stat: "ac", value: 1, type: "dodge" },
            { stat: "attack", value: 1, type: "untyped" },
          ],
        },
        { sourceName: "Pele de Árvore", modifiers: [{ stat: "ac", value: 2, type: "natural" }] },
      ],
    );
    expect(d).toMatchObject({ ac: 20, touch: 14, flatFooted: 18 });
    expect(d.attacks[0]!.bonus).toBe(3);
  });

  it("estado pelos PV", () => {
    expect([5, 0, -3, -10].map(hpState)).toEqual(["ok", "disabled", "dying", "dead"]);
  });
});
