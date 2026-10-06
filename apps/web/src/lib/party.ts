import type { CharacterView, TableState } from "@mesa/protocol";
import { levelForXp, partyLevel, xpForLevel } from "@mesa/rules";

/** Nível de personagem (soma das classes). */
export const characterLevel = (c: Pick<CharacterView, "classes">) =>
  c.classes.reduce((s, x) => s + x.level, 0);

/** XP no nível atual: quanto falta e se já pode subir. */
export function xpProgress(c: Pick<CharacterView, "classes" | "xp">) {
  const level = characterLevel(c);
  const allowed = levelForXp(c.xp);
  const from = xpForLevel(level);
  const to = level >= 20 ? from : xpForLevel(level + 1);
  return {
    level,
    allowed,
    canLevelUp: allowed > level && level < 20,
    from,
    to,
    pct: to > from ? Math.max(0, Math.min(100, ((c.xp - from) / (to - from)) * 100)) : 100,
  };
}

/** Grupo de aventureiros: fichas de jogadores (as do mestre são NPCs). */
export function party(table: Pick<TableState, "characters" | "players" | "campaign">) {
  const gmIds = new Set(table.players.filter((p) => p.role === "GM").map((p) => p.id));
  const members = table.characters.filter((c) => !gmIds.has(c.ownerId));
  const levels = members.map(characterLevel);
  return {
    members,
    level: members.length ? partyLevel(levels) : table.campaign.startLevel,
    size: members.length,
  };
}
