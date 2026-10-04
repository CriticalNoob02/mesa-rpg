import { ABILITIES, type Ability, type Size } from "@mesa/srd";

/** Custo do point-buy (Livro do Mestre 3.5): 8 = 0 … 18 = 16. */
export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 6,
  15: 8,
  16: 10,
  17: 13,
  18: 16,
};
/** Orçamento padrão de campanha ("campanha padrão" do Livro do Mestre). */
export const POINT_BUY_BUDGET = 25;

export function pointBuyCost(abilities: Record<Ability, number>): number | null {
  let total = 0;
  for (const a of ABILITIES) {
    const cost = POINT_BUY_COST[abilities[a]];
    if (cost === undefined) return null;
    total += cost;
  }
  return total;
}

export const ABILITY_PT: Record<Ability, { short: string; name: string }> = {
  str: { short: "For", name: "Força" },
  dex: { short: "Des", name: "Destreza" },
  con: { short: "Con", name: "Constituição" },
  int: { short: "Int", name: "Inteligência" },
  wis: { short: "Sab", name: "Sabedoria" },
  cha: { short: "Car", name: "Carisma" },
};

// Carga pesada máxima (lb) por Força 1–29; leve = 1/3, média = 2/3.
const HEAVY = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460,
  520, 600, 700, 800, 920, 1040, 1200, 1400,
];

export type LoadCategory = "light" | "medium" | "heavy" | "overloaded";

export function carryingCapacity(str: number, size: Size) {
  let heavy: number;
  if (str <= 0) heavy = 0;
  else if (str <= 29) heavy = HEAVY[str]!;
  else {
    // Acima de 29: ×4 a cada +10.
    const tens = Math.floor((str - 20) / 10);
    heavy = HEAVY[str - tens * 10]! * 4 ** tens;
  }
  if (size === "small") heavy = Math.floor((heavy * 3) / 4);
  return { light: Math.floor(heavy / 3), medium: Math.floor((heavy * 2) / 3), heavy };
}

export function loadCategory(
  weight: number,
  cap: ReturnType<typeof carryingCapacity>,
): LoadCategory {
  if (weight <= cap.light) return "light";
  if (weight <= cap.medium) return "medium";
  if (weight <= cap.heavy) return "heavy";
  return "overloaded";
}
