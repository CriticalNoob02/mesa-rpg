/**
 * Notação de dados: termos somados/subtraídos, ex. `1d20+5`, `2d6 - 1`, `4d6kh3`, `d%`.
 *
 * Puro, sem I/O: quem rola passa o RNG. O servidor usa `crypto.randomInt`, então
 * nenhum cliente decide resultado.
 */

export const DICE_LIMITS = {
  maxExpressionLength: 100,
  maxTerms: 20,
  maxDicePerTerm: 100,
  maxDiceTotal: 200,
  maxSides: 1000,
  maxConstant: 10_000,
} as const;

export class DiceError extends Error {
  override name = "DiceError";
}

export type KeepRule = { mode: "h" | "l"; n: number };

export type ParsedTerm =
  | { kind: "dice"; sign: 1 | -1; count: number; sides: number; keep?: KeepRule }
  | { kind: "const"; sign: 1 | -1; value: number };

export type RolledTerm =
  | {
      kind: "dice";
      sign: 1 | -1;
      count: number;
      sides: number;
      keep?: KeepRule;
      rolls: number[];
      kept: boolean[];
      subtotal: number;
    }
  | { kind: "const"; sign: 1 | -1; value: number; subtotal: number };

export type RollResult = { expr: string; terms: RolledTerm[]; total: number };

/** Devolve um inteiro em [1, sides]. */
export type DieRng = (sides: number) => number;

const TERM_RE = /^(\d*)d(\d+|%)(?:k([hl]?)(\d+))?$|^(\d+)$/;

export function parseExpr(input: string): ParsedTerm[] {
  if (input.length > DICE_LIMITS.maxExpressionLength) {
    throw new DiceError(`Expressão longa demais (máx. ${DICE_LIMITS.maxExpressionLength}).`);
  }
  const src = input.toLowerCase().replace(/\s+/g, "");
  if (!src) throw new DiceError("Expressão vazia.");

  const terms: ParsedTerm[] = [];
  let diceTotal = 0;
  // Separa mantendo o sinal: "1d20+5-1" → ["1d20", "+5", "-1"].
  const parts = src.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join("") !== src) throw new DiceError(`Expressão inválida: "${input}".`);

  for (const part of parts) {
    const sign: 1 | -1 = part.startsWith("-") ? -1 : 1;
    const body = part.replace(/^[+-]/, "");
    const m = TERM_RE.exec(body);
    if (!m) throw new DiceError(`Termo inválido: "${body}".`);

    if (m[5] !== undefined) {
      const value = Number(m[5]);
      if (value > DICE_LIMITS.maxConstant) throw new DiceError("Modificador grande demais.");
      terms.push({ kind: "const", sign, value });
    } else {
      const count = m[1] ? Number(m[1]) : 1;
      const sides = m[2] === "%" ? 100 : Number(m[2]);
      if (count < 1 || count > DICE_LIMITS.maxDicePerTerm) {
        throw new DiceError(`Quantidade de dados deve ser de 1 a ${DICE_LIMITS.maxDicePerTerm}.`);
      }
      if (sides < 2 || sides > DICE_LIMITS.maxSides) {
        throw new DiceError(`Dado deve ter de 2 a ${DICE_LIMITS.maxSides} faces.`);
      }
      diceTotal += count;
      let keep: KeepRule | undefined;
      if (m[4] !== undefined) {
        const n = Number(m[4]);
        if (n < 1 || n > count) throw new DiceError(`Manter deve ser de 1 a ${count}.`);
        keep = { mode: m[3] === "l" ? "l" : "h", n };
      }
      terms.push({ kind: "dice", sign, count, sides, ...(keep ? { keep } : {}) });
    }
  }

  if (terms.length > DICE_LIMITS.maxTerms) throw new DiceError("Termos demais.");
  if (diceTotal > DICE_LIMITS.maxDiceTotal) throw new DiceError("Dados demais na expressão.");
  return terms;
}

export function formatTerms(terms: ParsedTerm[]): string {
  return terms
    .map((t, i) => {
      const op = t.sign === -1 ? "-" : i === 0 ? "" : "+";
      if (t.kind === "const") return `${op}${t.value}`;
      const keep = t.keep ? `k${t.keep.mode}${t.keep.n}` : "";
      return `${op}${t.count}d${t.sides}${keep}`;
    })
    .join("");
}

export function rollExpr(input: string, rng: DieRng): RollResult {
  const parsed = parseExpr(input);
  const terms: RolledTerm[] = parsed.map((t) => {
    if (t.kind === "const") return { ...t, subtotal: t.sign * t.value };
    const rolls = Array.from({ length: t.count }, () => rng(t.sides));
    const kept = keepMask(rolls, t.keep);
    const sum = rolls.reduce((acc, r, i) => (kept[i] ? acc + r : acc), 0);
    return { ...t, rolls, kept, subtotal: t.sign * sum };
  });
  return {
    expr: formatTerms(parsed),
    terms,
    total: terms.reduce((acc, t) => acc + t.subtotal, 0),
  };
}

function keepMask(rolls: number[], keep?: KeepRule): boolean[] {
  if (!keep) return rolls.map(() => true);
  // Índices ordenados pelo valor; empate mantém o primeiro rolado.
  const order = rolls
    .map((value, index) => ({ value, index }))
    .sort(
      (a, b) => (keep.mode === "h" ? b.value - a.value : a.value - b.value) || a.index - b.index,
    );
  const keepSet = new Set(order.slice(0, keep.n).map((o) => o.index));
  return rolls.map((_, i) => keepSet.has(i));
}

/** Rolagem de d20 único (o caso de ataque/teste): 20 natural ou 1 natural. */
export function naturalD20(result: RollResult): 1 | 20 | null {
  const dice = result.terms.flatMap((t) => (t.kind === "dice" ? [t] : []));
  const term = dice.length === 1 ? dice[0] : undefined;
  if (term?.sides !== 20 || term.count !== 1) return null;
  const roll = term.rolls[0];
  return roll === 20 ? 20 : roll === 1 ? 1 : null;
}
