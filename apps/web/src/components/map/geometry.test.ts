import type { SceneView, TokenView } from "@mesa/protocol";
import { describe, expect, it } from "vitest";
import { NO_AMBIENCE } from "@/test/fixtures";
import {
  brushCells,
  canQuickAttack,
  cellAt,
  firstFreeCell,
  hpColor,
  initials,
  previewCost,
  reachBands,
  tokenBadges,
  tokenHp,
  tokenMovement,
} from "./geometry";

const scene = {
  id: "s",
  name: "S",
  assetId: null,
  gridSize: 50,
  offsetX: 0,
  offsetY: 0,
  cols: 10,
  rows: 8,
  fogEnabled: false,
  revealed: [],
  ...NO_AMBIENCE,
  tokens: [],
} as SceneView;
const token: TokenView = {
  id: "t",
  sceneId: "s",
  characterId: null,
  ownerId: null,
  name: "Goblin Arqueiro",
  x: 2,
  y: 2,
  size: 1,
  color: "#fff",
  hidden: false,
  speed: 30,
  moveSpent: 0,
  diagParity: 0,
};

describe("geometry", () => {
  it("célula sob o ponto, presa ao grid", () => {
    expect(cellAt(75, 120, scene)).toEqual({ x: 1, y: 2 });
    expect(cellAt(-10, 9999, scene)).toEqual({ x: 0, y: 7 });
  });

  it("pincel respeita bordas", () => {
    expect(brushCells({ x: 0, y: 0 }, 3, scene)).toEqual([0, 1, 10, 11]);
    expect(brushCells({ x: 5, y: 5 }, 1, scene)).toEqual([55]);
  });

  it("faixas de alcance descontam o que já andou", () => {
    const fresh = reachBands(token, 30, 4, scene);
    expect(fresh.find((c) => c.x === 8 && c.y === 2)?.band).toBe("move");
    expect(fresh.find((c) => c.x === 9 && c.y === 2)?.band).toBe("double");
    const tired = reachBands({ ...token, moveSpent: 6 }, 30, 4, scene);
    expect(tired.find((c) => c.x === 3 && c.y === 2)?.band).toBe("double");
    expect(reachBands({ ...token, moveSpent: 24 }, 30, 4, scene)).toEqual([]);
  });

  it("custo da prévia usa a paridade do token", () => {
    expect(previewCost(token, { x: 3, y: 3 })).toBe(1);
    expect(previewCost({ ...token, diagParity: 1 }, { x: 3, y: 3 })).toBe(2);
  });

  it("deslocamento do token sem ficha e iniciais", () => {
    expect(tokenMovement(token, [])).toEqual({ speed: 30, runMultiplier: 4 });
    expect(initials("Goblin Arqueiro")).toBe("GA");
    expect(initials(" ")).toBe("?");
  });
});

describe("firstFreeCell", () => {
  it("pula células ocupadas, inclusive por token grande", () => {
    expect(firstFreeCell({ cols: 3, rows: 2, tokens: [] })).toEqual({ x: 0, y: 0 });
    expect(
      firstFreeCell({ cols: 3, rows: 2, tokens: [{ ...token, x: 0, y: 0, size: 2 }] }),
    ).toEqual({ x: 2, y: 0 });
    expect(firstFreeCell({ cols: 1, rows: 1, tokens: [{ ...token, x: 0, y: 0 }] })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("tokens na mesa", () => {
  const pc: TokenView = { ...token, id: "p", characterId: "c1", ownerId: "u1" };
  it("firstFreeCell respeita o tamanho do token", () => {
    const s = { cols: 4, rows: 4, tokens: [{ ...token, x: 1, y: 0 }] };
    expect(firstFreeCell(s, 2)).toEqual({ x: 2, y: 0 });
    expect(firstFreeCell({ ...s, cols: 3 }, 2)).toEqual({ x: 0, y: 1 });
  });
  it("vida do personagem vem da lista; NPC só com ficha", () => {
    const chars = [{ id: "c1", hp: { current: 3, max: 9 } }] as never;
    expect(tokenHp(pc, chars)).toEqual({ current: 3, max: 9 });
    expect(tokenHp(token, chars)).toBeNull();
    const stats = { hp: 2, hpMax: 5 } as never;
    expect(tokenHp({ ...token, stats }, chars)).toEqual({ current: 2, max: 5 });
  });
  it("etiquetas: condição em português ou nome do efeito", () => {
    const fx = [
      { id: "e1", targetType: "token", targetId: "t", sourceName: "x", conditionKey: "blinded" },
      { id: "e2", targetType: "token", targetId: "t", sourceName: "Bênção", conditionKey: null },
      {
        id: "e3",
        targetType: "character",
        targetId: "c1",
        sourceName: "Fúria",
        conditionKey: null,
      },
    ] as never;
    expect(tokenBadges(token, fx)).toEqual(["Cego", "Bênção"]);
    expect(tokenBadges(pc, fx)).toEqual(["Fúria"]);
  });
  it("ataque rápido só entre lados opostos", () => {
    expect(canQuickAttack(pc, token)).toBe(true);
    expect(canQuickAttack(token, pc)).toBe(true);
    expect(canQuickAttack(pc, { ...pc, id: "q" })).toBe(false);
    expect(canQuickAttack(token, { ...token, id: "u" })).toBe(false);
    expect(canQuickAttack(pc, pc)).toBe(false);
  });
  it("cor da vida", () => {
    expect(hpColor(9, 10)).toBe("#86c98f");
    expect(hpColor(4, 10)).toBe("#d9a45b");
    expect(hpColor(1, 10)).toBe("#e46d61");
  });
});
