import { describe, expect, it } from "vitest";
import { parseCommand } from "./command";

describe("parseCommand", () => {
  it("ignora vazio", () => {
    expect(parseCommand("   ")).toBeNull();
  });

  it("texto comum é chat", () => {
    expect(parseCommand("  bora!  ")).toEqual({ type: "chat", input: { text: "bora!" } });
  });

  it.each([
    ["/r 1d20+5", { expr: "1d20+5" }],
    ["/r 1d20 + 5 ataque com espada", { expr: "1d20+5", label: "ataque com espada" }],
    ["/roll d% tesouro", { expr: "d%", label: "tesouro" }],
    ["/R 4d6kh3", { expr: "4d6kh3" }],
    ["/r 2d6 -1 dano", { expr: "2d6-1", label: "dano" }],
    ["/gr 1d20 percepção", { expr: "1d20", label: "percepção", hidden: true }],
    ["/gmroll 1d4", { expr: "1d4", hidden: true }],
  ])("%j rola", (raw, input) => {
    expect(parseCommand(raw)).toEqual({ type: "roll", input });
  });

  it("exige dados", () => {
    expect(parseCommand("/r")).toMatchObject({ type: "error" });
    expect(parseCommand("/r ataque")).toMatchObject({ type: "error" });
  });

  it("recusa comando desconhecido", () => {
    expect(parseCommand("/xyz")).toEqual({
      type: "error",
      message: "Comando desconhecido. Use /r ou /gr.",
    });
  });
});
