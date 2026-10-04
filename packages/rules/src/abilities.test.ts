import { describe, expect, it } from "vitest";
import { carryingCapacity, loadCategory, pointBuyCost } from "./abilities";

describe("abilities", () => {
  it("point-buy devolve null fora da tabela", () => {
    expect(pointBuyCost({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBe(0);
    expect(pointBuyCost({ str: 18, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBe(16);
    expect(pointBuyCost({ str: 19, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeNull();
  });

  it("capacidade de carga (tabela 9-1) e tamanho pequeno", () => {
    expect(carryingCapacity(10, "medium")).toEqual({ light: 33, medium: 66, heavy: 100 });
    expect(carryingCapacity(18, "medium")).toEqual({ light: 100, medium: 200, heavy: 300 });
    expect(carryingCapacity(10, "small").heavy).toBe(75);
    expect(carryingCapacity(30, "medium").heavy).toBe(1600);
    expect(carryingCapacity(39, "medium").heavy).toBe(5600);
    expect(carryingCapacity(0, "medium").heavy).toBe(0);
  });

  it("categoria de carga", () => {
    const cap = carryingCapacity(10, "medium");
    expect([0, 33, 34, 66, 67, 100, 101].map((w) => loadCategory(w, cap))).toEqual([
      "light",
      "light",
      "medium",
      "medium",
      "heavy",
      "heavy",
      "overloaded",
    ]);
  });
});
