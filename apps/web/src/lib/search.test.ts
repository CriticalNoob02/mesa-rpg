import { describe, expect, it } from "vitest";
import { byPt, matches, normalize } from "./search";

describe("search", () => {
  it("ignora acento e caixa", () => {
    expect(normalize("Órgão Á")).toBe("orgao a");
    expect(matches("bencao", "Bênção")).toBe(true);
  });

  it("casa em qualquer idioma", () => {
    expect(matches("fireball", "Bola de Fogo", "Fireball")).toBe(true);
    expect(matches("bola", "Bola de Fogo", "Fireball")).toBe(true);
    expect(matches("gelo", "Bola de Fogo", "Fireball", null)).toBe(false);
    expect(matches("  ", "x")).toBe(true);
  });

  it("ordena em português", () => {
    expect(["Zumbi", "Água", "Bola"].sort(byPt((x) => x))).toEqual(["Água", "Bola", "Zumbi"]);
  });
});
