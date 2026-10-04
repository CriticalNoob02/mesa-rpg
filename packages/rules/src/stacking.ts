import type { BonusType, Modifier, StatKey } from "@mesa/srd";

/** Tipos que somam entre si; os demais valem só o maior. */
export const STACKING_TYPES: ReadonlySet<BonusType> = new Set(["dodge", "untyped", "circumstance"]);

export type Part = { label: string; value: number; type: BonusType; ignored?: boolean };
export type Stat = { total: number; parts: Part[] };

export type LabeledModifier = Modifier & { label: string };

/**
 * Soma respeitando o empilhamento do 3.5: penalidades sempre somam; bônus do
 * mesmo tipo não somam (vale o maior), exceto esquiva, sem tipo e circunstância.
 * Os bônus descartados voltam marcados `ignored` para a ficha explicar a conta.
 */
export function stack(mods: LabeledModifier[], base = 0): Stat {
  const parts: Part[] = [];
  const bestByType = new Map<BonusType, number>();
  mods.forEach((m, i) => {
    if (m.value <= 0 || STACKING_TYPES.has(m.type)) return;
    const best = bestByType.get(m.type);
    if (best === undefined || m.value > mods[best]!.value) bestByType.set(m.type, i);
  });
  let total = base;
  mods.forEach((m, i) => {
    if (m.value === 0) return;
    const counts = m.value < 0 || STACKING_TYPES.has(m.type) || bestByType.get(m.type) === i;
    if (counts) total += m.value;
    parts.push({
      label: m.label,
      value: m.value,
      type: m.type,
      ...(counts ? {} : { ignored: true }),
    });
  });
  return { total, parts };
}

/** Modificadores que miram qualquer uma das chaves. */
export function pick(mods: LabeledModifier[], ...stats: StatKey[]): LabeledModifier[] {
  return mods.filter((m) => stats.includes(m.stat));
}

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
