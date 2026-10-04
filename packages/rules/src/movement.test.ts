import { describe, expect, it } from "vitest";
import {
  moveBudgets,
  moveCost,
  pathCost,
  reachable,
  speedSquares,
  squaresToMeters,
} from "./movement";

describe("moveCost", () => {
  it("reta custa 1 por quadrado", () => {
    expect(moveCost({ x: 0, y: 0 }, { x: 6, y: 0 })).toEqual({ squares: 6, parity: 0 });
    expect(moveCost({ x: 3, y: 3 }, { x: 3, y: 0 })).toEqual({ squares: 3, parity: 0 });
  });

  it("5 diagonais custam 7 quadrados (1-2-1-2-1)", () => {
    expect(moveCost({ x: 0, y: 0 }, { x: 5, y: 5 })).toEqual({ squares: 7, parity: 1 });
  });

  it("mistura reta e diagonal", () => {
    // 2 diagonais (1+2) + 3 retos
    expect(moveCost({ x: 0, y: 0 }, { x: 5, y: 2 }).squares).toBe(6);
  });

  it("paridade continua entre movimentos da mesma rodada", () => {
    const first = moveCost({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(first).toEqual({ squares: 1, parity: 1 });
    expect(moveCost({ x: 1, y: 1 }, { x: 2, y: 2 }, first.parity)).toEqual({
      squares: 2,
      parity: 0,
    });
  });
});

describe("pathCost", () => {
  it("soma os passos com a regra 1-2-1", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 3 },
    ];
    expect(pathCost(path)).toEqual({ squares: 1 + 2 + 1 + 1, parity: 1 });
  });

  it("recusa salto", () => {
    expect(() =>
      pathCost([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toThrow(/salto/);
  });
});

describe("orçamento e alcance", () => {
  it("deslocamento 9 m = 6 quadrados; corrida ×4 ou ×3", () => {
    expect(speedSquares(30)).toBe(6);
    expect(moveBudgets(30)).toEqual({ move: 6, double: 12, run: 24 });
    expect(moveBudgets(20, 3)).toEqual({ move: 4, double: 8, run: 12 });
    expect(squaresToMeters(6)).toBe(9);
  });

  it("alcance respeita a diagonal e as bordas", () => {
    const r = reachable({ x: 0, y: 0 }, 3, { cols: 10, rows: 10 });
    expect(r.get("3:0")).toBe(3);
    expect(r.get("2:2")).toBe(3);
    expect(r.has("3:3")).toBe(false); // 3 diagonais = 4
    expect(r.has("4:0")).toBe(false);
    expect([...r.keys()].every((k) => !k.startsWith("-"))).toBe(true);
  });

  it("orçamento negativo não alcança nada; zero só a origem", () => {
    expect(reachable({ x: 1, y: 1 }, -1, { cols: 5, rows: 5 }).size).toBe(0);
    expect([...reachable({ x: 1, y: 1 }, 0, { cols: 5, rows: 5 }).keys()]).toEqual(["1:1"]);
  });
});
