import monsters from "../data/monsters.json";
import monstersPt from "../data/pt/monsters.json";
import type { Monster } from "./types";

type MonstersPt = {
  monsters?: Record<string, string>;
  types?: Record<string, string>;
  attackNames?: Record<string, string>;
};
const pt = monstersPt as MonstersPt;

/** Monstros do SRD com nomes em português (ataques traduzidos para a ficha do NPC). */
export const MONSTERS = (monsters as Monster[]).map(
  (m): Monster => ({
    ...m,
    ...(pt.monsters?.[m.id] ? { namePt: pt.monsters[m.id] } : {}),
    ...(pt.types?.[m.type] ? { typePt: pt.types[m.type] } : {}),
    attacks: m.attacks.map((a) => ({ ...a, name: pt.attackNames?.[a.name] ?? a.name })),
  }),
);

/** Nível de desafio como número para ordenar ("1/3" → 0,33). */
export function crValue(cr: string): number {
  const m = /^(\d+)\/(\d+)$/.exec(cr);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(cr);
  return Number.isFinite(n) ? n : 99;
}
