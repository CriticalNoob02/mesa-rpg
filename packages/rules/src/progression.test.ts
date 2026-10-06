import { SRD } from "@mesa/srd";
import { SPELLS } from "@mesa/srd/spells";
import { describe, expect, it } from "vitest";
import {
  crForGroup,
  crNumber,
  difficultyOf,
  encounterLevel,
  encounterXp,
  levelForXp,
  monsterXp,
  partyLevel,
  targetEncounterLevel,
  xpForLevel,
} from "./progression";
import { quickNpc } from "./quick";

describe("tabela de XP", () => {
  it("xpForLevel segue 1000 × n(n−1)/2", () => {
    expect([1, 2, 3, 4, 5, 10, 20].map(xpForLevel)).toEqual([
      0, 1000, 3000, 6000, 10000, 45000, 190000,
    ]);
  });

  it("levelForXp é o inverso e trava no 20", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(999)).toBe(1);
    expect(levelForXp(1000)).toBe(2);
    expect(levelForXp(2999)).toBe(2);
    expect(levelForXp(3000)).toBe(3);
    expect(levelForXp(1_000_000)).toBe(20);
  });
});

describe("crNumber", () => {
  it("lê inteiro, fração e texto com observação", () => {
    expect(crNumber("3")).toBe(3);
    expect(crNumber("1/2")).toBe(0.5);
    expect(crNumber("5 (noble 8)")).toBe(5);
    expect(crNumber("'")).toBeNull();
    expect(crNumber(undefined)).toBeNull();
  });
});

describe("monsterXp (tabela do Livro do Mestre)", () => {
  // Linhas da tabela: [nível, ND] → XP para um personagem antes de dividir.
  it.each([
    [1, 1, 300],
    [3, 1, 300],
    [3, 2, 600],
    [3, 3, 900],
    [3, 4, 1350],
    [3, 5, 1800],
    [4, 1, 300],
    [4, 3, 800],
    [5, 2, 500],
    [6, 2, 450],
    [6, 7, 2700],
    [7, 1, 262.5],
    [8, 1, 200],
    [8, 2, 300],
    [8, 11, 7200],
    [8, 15, 28800],
  ])("nível %i, ND %s → %s", (level, cr, xp) => {
    expect(monsterXp(level, cr)).toBeCloseTo(xp);
  });

  it("ND fracionário e diferença grande demais", () => {
    expect(monsterXp(1, 0.5)).toBe(150);
    expect(monsterXp(10, 1)).toBe(0);
  });
});

describe("encontro", () => {
  it("4 personagens de 1º contra 4 goblins (ND 1/3) ganham 100 XP cada", () => {
    expect(encounterXp([1, 1, 1, 1], [1 / 3, 1 / 3, 1 / 3, 1 / 3])).toEqual([100, 100, 100, 100]);
  });

  it("grupo misto recebe pela linha de cada nível", () => {
    expect(encounterXp([3, 8], [3])).toEqual([450, 200]);
  });

  it("Nível de Encontro: dois iguais = ND+2, quatro = ND+4", () => {
    expect(encounterLevel([5])).toBe(5);
    expect(encounterLevel([5, 5])).toBe(7);
    expect(encounterLevel([5, 5, 5, 5])).toBe(9);
    expect(encounterLevel([0.5, 0.5])).toBe(1);
    expect(encounterLevel([])).toBe(0);
  });

  it("nível do grupo, alvo e dificuldade", () => {
    expect(partyLevel([3, 4, 4, 5])).toBe(4);
    expect(partyLevel([])).toBe(1);
    expect(targetEncounterLevel(4, 4, "medium")).toBe(4);
    expect(targetEncounterLevel(4, 6, "hard")).toBe(7);
    expect(targetEncounterLevel(1, 2, "easy")).toBe(1);
    expect(difficultyOf(4, 4)).toBe("medium");
    expect(difficultyOf(2, 4)).toBe("easy");
    expect(difficultyOf(7, 4)).toBe("hard");
    expect(difficultyOf(9, 4)).toBe("deadly");
  });

  it("crForGroup reparte o NE entre monstros iguais", () => {
    expect(crForGroup(5, 1)).toBe(5);
    expect(crForGroup(5, 2)).toBe(3);
    expect(crForGroup(5, 4)).toBe(1);
    expect(crForGroup(2, 4)).toBeCloseTo(1 / 3);
    expect(crForGroup(1, 4)).toBe(0.25);
    expect(crForGroup(1, 8)).toBe(0.125);
    expect(crForGroup(1, 16)).toBeNull();
  });
});

describe("quickNpc", () => {
  it("guerreiro humano 5: bloco de NPC coerente com a ficha", () => {
    const { base, stats } = quickNpc(
      { name: "Capitão", raceId: "human", classId: "fighter", level: 5 },
      SRD,
      SPELLS,
    );
    expect(base.levels).toHaveLength(5);
    expect(stats.cr).toBe("5");
    expect(stats.hp).toBe(stats.hpMax);
    expect(stats.hp).toBeGreaterThan(30);
    expect(stats.attacks[0]!.bonus).toBeGreaterThanOrEqual(7);
    expect(stats.ac).toBeGreaterThan(stats.touch);
  });
});
