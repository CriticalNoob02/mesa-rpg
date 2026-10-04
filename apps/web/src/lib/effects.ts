import type { EffectView, TableState } from "@mesa/protocol";
import type { ActiveEffect } from "@mesa/rules";

/** Efeitos de um personagem no formato do motor de regras. */
export function characterEffects(effects: EffectView[], characterId: string): ActiveEffect[] {
  return effects
    .filter((e) => e.targetType === "character" && e.targetId === characterId)
    .map((e) => ({
      id: e.id,
      sourceName: e.sourceName,
      modifiers: e.modifiers,
      ...(e.conditionKey ? { conditionKey: e.conditionKey } : {}),
    }));
}

/** Efeitos do alvo de um token: o personagem (se houver) ou o próprio token. */
export function tokenTargetEffects(
  table: TableState,
  token: { id: string; characterId: string | null },
) {
  return token.characterId
    ? table.effects.filter((e) => e.targetType === "character" && e.targetId === token.characterId)
    : table.effects.filter((e) => e.targetType === "token" && e.targetId === token.id);
}

export const roundsLabel = (n: number | null) => (n === null ? "" : `${n} rod.`);
