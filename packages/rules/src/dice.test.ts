import { describe, expect, it } from "vitest";
import { DICE_LIMITS, DiceError, formatTerms, naturalD20, parseExpr, rollExpr } from "./dice";

/** RNG determinístico: devolve a sequência dada, em loop. */
const seq =
  (...values: number[]) =>
  () => {
    const v = values.shift();
    if (v === undefined) throw new Error("sequência acabou");
    return v;
  };

describe("parseExpr", () => {
  it("lê dado com modificador", () => {
    expect(parseExpr("1d20+5")).toEqual([
      { kind: "dice", sign: 1, count: 1, sides: 20 },
      { kind: "const", sign: 1, value: 5 },
    ]);
  });

  it("aceita espaços, maiúsculas, contagem implícita e d%", () => {
    expect(parseExpr(" D8 - 1 + d% ")).toEqual([
      { kind: "dice", sign: 1, count: 1, sides: 8 },
      { kind: "const", sign: -1, value: 1 },
      { kind: "dice", sign: 1, count: 1, sides: 100 },
    ]);
  });

  it("lê manter maiores/menores", () => {
    expect(parseExpr("4d6kh3")[0]).toMatchObject({ keep: { mode: "h", n: 3 } });
    expect(parseExpr("2d20kl1")[0]).toMatchObject({ keep: { mode: "l", n: 1 } });
    expect(parseExpr("4d6k3")[0]).toMatchObject({ keep: { mode: "h", n: 3 } });
  });

  it("aceita termo negativo no início", () => {
    expect(parseExpr("-2+1d4")[0]).toEqual({ kind: "const", sign: -1, value: 2 });
  });

  it.each([
    ["", "vazia"],
    ["   ", "vazia"],
    ["1d", "inválido"],
    ["d20++5", "inválid"],
    ["1d20+", "inválid"],
    ["abc", "inválido"],
    ["1d1", "faces"],
    ["1d1001", "faces"],
    ["0d6", "Quantidade"],
    ["101d6", "Quantidade"],
    ["4d6kh5", "Manter"],
    ["4d6kh0", "Manter"],
    ["10001", "grande"],
    ["100d6+100d6+1d6", "Dados demais"],
  ])("recusa %j (%s)", (expr, msg) => {
    expect(() => parseExpr(expr)).toThrow(DiceError);
    expect(() => parseExpr(expr)).toThrow(new RegExp(msg));
  });

  it("recusa expressão longa e termos demais", () => {
    expect(() => parseExpr("1".repeat(DICE_LIMITS.maxExpressionLength + 1))).toThrow(/longa/);
    expect(() => parseExpr(Array(21).fill("1").join("+"))).toThrow(/Termos demais/);
  });
});

describe("formatTerms", () => {
  it("normaliza a expressão", () => {
    expect(formatTerms(parseExpr(" d20 + 5 - D4 + 4D6K3 "))).toBe("1d20+5-1d4+4d6kh3");
    expect(formatTerms(parseExpr("-1+d%"))).toBe("-1+1d100");
  });
});

describe("rollExpr", () => {
  it("soma dados e modificadores", () => {
    const r = rollExpr("2d6+3-1d4", seq(4, 5, 2));
    expect(r.expr).toBe("2d6+3-1d4");
    expect(r.total).toBe(4 + 5 + 3 - 2);
    expect(r.terms[0]).toMatchObject({ rolls: [4, 5], kept: [true, true], subtotal: 9 });
    expect(r.terms[2]).toMatchObject({ rolls: [2], subtotal: -2 });
  });

  it("4d6kh3 descarta o menor", () => {
    const r = rollExpr("4d6kh3", seq(3, 1, 6, 4));
    expect(r.terms[0]).toMatchObject({ kept: [true, false, true, true], subtotal: 13 });
    expect(r.total).toBe(13);
  });

  it("empate no manter descarta o último rolado", () => {
    const r = rollExpr("3d6kl2", seq(2, 2, 2));
    expect(r.terms[0]).toMatchObject({ kept: [true, true, false], subtotal: 4 });
  });

  it("passa o número de faces ao RNG", () => {
    const sides: number[] = [];
    rollExpr("1d20+d%", (s) => {
      sides.push(s);
      return 1;
    });
    expect(sides).toEqual([20, 100]);
  });
});

describe("naturalD20", () => {
  it("detecta 20 e 1 naturais num d20 único", () => {
    expect(naturalD20(rollExpr("1d20+5", seq(20)))).toBe(20);
    expect(naturalD20(rollExpr("d20", seq(1)))).toBe(1);
    expect(naturalD20(rollExpr("1d20", seq(12)))).toBeNull();
  });

  it("ignora quando não é um d20 único", () => {
    expect(naturalD20(rollExpr("2d20kh1", seq(20, 3)))).toBeNull();
    expect(naturalD20(rollExpr("1d20+1d6", seq(20, 3)))).toBeNull();
    expect(naturalD20(rollExpr("1d12", seq(1)))).toBeNull();
    expect(naturalD20(rollExpr("5", seq()))).toBeNull();
  });
});
