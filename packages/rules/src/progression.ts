/**
 * Experiência e desafio (Livro do Mestre 3.5): tabela de XP por nível, XP por
 * monstro conforme ND × nível do personagem, Nível de Encontro e nível do grupo.
 */

export const MAX_LEVEL = 20;

/** XP mínimo para estar no nível `level` (1º = 0, 2º = 1.000, 3º = 3.000…). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return (1000 * n * (n - 1)) / 2;
}

/** Nível que o XP alcança (no máximo 20). */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** ND do SRD em número: "1/2" → 0,5; "5 (noble 8)" → 5; texto sem número → null. */
export function crNumber(cr: string | number | null | undefined): number | null {
  if (typeof cr === "number") return Number.isFinite(cr) && cr > 0 ? cr : null;
  const m = /^\s*(\d+)(?:\s*\/\s*(\d+))?/.exec(cr ?? "");
  if (!m) return null;
  const n = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
  return n > 0 ? n : null;
}

/** Multiplicador da tabela pela diferença ND − nível (−1 → ⅔, +1 → 1,5, ±2 → ×2/÷2…). */
function factor(diff: number): number {
  if (diff % 2 === 0) return 2 ** (diff / 2);
  return diff > 0 ? 1.5 * 2 ** ((diff - 1) / 2) : (2 / 3) * 2 ** ((diff + 1) / 2);
}

/**
 * XP de um monstro para UM personagem de `level`, antes de dividir pelo grupo
 * (tabela "Experience Point Awards"). Níveis 1–3 usam a linha do 3º; monstro
 * mais fraco que o personagem nunca passa de 300 × ND; ND abaixo de 1 é fração
 * do ND 1; diferença de 8+ para baixo não dá XP e para cima trava no máximo da
 * tabela (+7).
 */
export function monsterXp(level: number, cr: number): number {
  if (!(cr > 0)) return 0;
  if (cr < 1) return monsterXp(level, 1) * cr;
  const l = Math.max(3, Math.min(MAX_LEVEL, Math.floor(level)));
  const crInt = Math.floor(cr);
  const diff = crInt - l;
  if (diff <= -8) return 0;
  const xp = 300 * l * factor(Math.min(diff, 7));
  return crInt < l ? Math.min(xp, 300 * crInt) : xp;
}

/**
 * XP de cada personagem pelo encontro: soma do XP de cada monstro para o nível
 * dele, dividida pelo número de personagens que participaram.
 */
export function encounterXp(levels: number[], crs: number[]): number[] {
  const n = levels.length;
  if (!n) return [];
  return levels.map((l) => Math.round(crs.reduce((sum, cr) => sum + monsterXp(l, cr), 0) / n));
}

/**
 * Nível de Encontro: dois monstros de ND x = NE x+2; quatro = x+4. Somado pela
 * "força" 2^(ND/2) de cada um (ND abaixo de 1 conta como fração do ND 1).
 */
export function encounterLevel(crs: number[]): number {
  const valid = crs.filter((c) => c > 0);
  if (!valid.length) return 0;
  const power = valid.reduce((s, c) => s + (c < 1 ? c * 2 ** 0.5 : 2 ** (c / 2)), 0);
  return Math.max(1, Math.round(2 * Math.log2(power)));
}

/** Nível médio do grupo, arredondado (mínimo 1). */
export function partyLevel(levels: number[]): number {
  if (!levels.length) return 1;
  return Math.max(1, Math.round(levels.reduce((s, l) => s + l, 0) / levels.length));
}

export const DIFFICULTIES = {
  easy: { label: "Fácil", delta: -2 },
  medium: { label: "Desafiador", delta: 0 },
  hard: { label: "Difícil", delta: 2 },
  deadly: { label: "Mortal", delta: 4 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

/** NE alvo: nível do grupo ajustado pela dificuldade; grupo maior/menor que 4 muda 1. */
export function targetEncounterLevel(level: number, partySize: number, difficulty: Difficulty) {
  const sizeAdj = partySize >= 6 ? 1 : partySize <= 2 ? -1 : 0;
  return Math.max(1, level + sizeAdj + DIFFICULTIES[difficulty].delta);
}

/** Rótulo da dificuldade de um NE contra o nível do grupo. */
export function difficultyOf(el: number, level: number): Difficulty {
  const d = el - level;
  if (d <= -2) return "easy";
  if (d <= 1) return "medium";
  if (d <= 3) return "hard";
  return "deadly";
}

// ND abaixo de 1 no "ND equivalente" do NE (força 2^(ND/2)): 1/2 ≈ −1, 1/4 ≈ −3…
const FRACTIONS: [cr: number, equivalent: number][] = [0.5, 1 / 3, 0.25, 1 / 6, 0.125].map((cr) => [
  cr,
  2 * Math.log2(cr * 2 ** 0.5),
]);

/**
 * Plano de encontro: para `count` monstros iguais chegarem ao NE alvo, cada um
 * tem ND ≈ NE − 2·log2(count). Devolve o ND (frações até 1/8) ou null se não cabe.
 */
export function crForGroup(targetEl: number, count: number): number | null {
  const eq = targetEl - 2 * Math.log2(Math.max(1, count));
  if (eq >= 0.5) return Math.max(1, Math.round(eq));
  if (eq < FRACTIONS.at(-1)![1] - 0.5) return null;
  return FRACTIONS.reduce((best, f) =>
    Math.abs(f[1] - eq) < Math.abs(best[1] - eq) ? f : best,
  )[0];
}
