import type { BonusType } from "@mesa/srd";

/** Peso em kg no padrão da edição brasileira (1 libra = 0,5 kg). */
export const kgFromLb = (lb: number) => lb / 2;
export const lbFromKg = (kg: number) => kg * 2;
export const kg = (lb: number) =>
  `${kgFromLb(lb).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;

/** "15 gp" → "15 PO"; "1,500 gp" → "1.500 PO"; "5 sp" → "5 PP". */
export function money(cost: string): string {
  return cost
    .replace(/(\d),(\d{3})/g, "$1.$2")
    .replace(/\bpp\b/g, "PL")
    .replace(/\bgp\b/g, "PO")
    .replace(/\bsp\b/g, "PP")
    .replace(/\bcp\b/g, "PC");
}

export const BONUS_PT: Record<BonusType, string> = {
  alchemical: "alquímico",
  armor: "armadura",
  circumstance: "circunstância",
  competence: "competência",
  deflection: "deflexão",
  dodge: "esquiva",
  enhancement: "melhoria",
  insight: "intuição",
  luck: "sorte",
  morale: "moral",
  natural: "natural",
  profane: "profano",
  racial: "racial",
  resistance: "resistência",
  sacred: "sagrado",
  shield: "escudo",
  size: "tamanho",
  untyped: "sem tipo",
};

export const FEAT_TYPE_PT: Record<string, string> = {
  General: "Geral",
  Fighter: "Guerreiro",
  Metamagic: "Metamágico",
  "Item Creation": "Criação de item",
  Special: "Especial",
};
