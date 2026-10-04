import { describe, expect, it } from "vitest";
import { kg, kgFromLb, lbFromKg, money } from "./format";

describe("format", () => {
  it("libras viram kg (metade)", () => {
    expect(kg(50)).toBe("25 kg");
    expect(kg(1)).toBe("0,5 kg");
    expect(lbFromKg(kgFromLb(13))).toBe(13);
  });

  it("moedas no padrão brasileiro", () => {
    expect(money("15 gp")).toBe("15 PO");
    expect(money("1,500 gp")).toBe("1.500 PO");
    expect(money("5 sp")).toBe("5 PP");
    expect(money("2 cp")).toBe("2 PC");
    expect(money("-")).toBe("-");
  });
});
