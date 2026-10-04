import type { Ability, ClassId, SrdClass } from "@mesa/srd";
import { abilityMod } from "./stacking";

/** Magias extras por atributo alto (tabela 1-1 do Livro do Jogador), nível 1–9. */
export function bonusSpells(score: number, spellLevel: number): number {
  const mod = abilityMod(score);
  if (spellLevel < 1 || mod < spellLevel) return 0;
  return Math.floor((mod - spellLevel) / 4) + 1;
}

export type Spellcasting = {
  classId: ClassId;
  classLevel: number;
  ability: Ability;
  style: "prepared" | "spontaneous";
  kind: "arcane" | "divine";
  list: string;
  casterLevel: number;
  /** null = ainda não conjura esse nível; 0 = conjura mas não tem espaço (atributo baixo ou só bônus). */
  perDay: (number | null)[];
  domainPerDay: number[];
  known: (number | null)[] | null;
  /** CD por nível de magia: 10 + nível + mod. do atributo. */
  dc: number[];
  /** Maior nível de magia que o atributo permite (10 + nível). */
  maxLevelByAbility: number;
};

export function spellcasting(
  cls: SrdClass,
  classLevel: number,
  score: number,
  extra: { casterLevel: number; dc: number },
): Spellcasting | null {
  if (!cls.casting || classLevel < 1) return null;
  const row = cls.levels[classLevel - 1]!;
  const maxLevelByAbility = Math.min(9, score - 10);
  const perDay = Array.from({ length: 10 }, (_, lvl) => {
    const base = row.slots?.[lvl];
    if (base == null) return null;
    if (lvl > maxLevelByAbility) return 0;
    return base + bonusSpells(score, lvl);
  });
  const domainPerDay = Array.from({ length: 10 }, (_, lvl) =>
    lvl <= maxLevelByAbility ? (row.domainSlots?.[lvl] ?? 0) : 0,
  );
  const cl = cls.casting.halfCasterLevel
    ? row.slots
      ? Math.floor(classLevel / 2)
      : 0
    : classLevel;
  return {
    classId: cls.id,
    classLevel,
    ability: cls.casting.ability,
    style: cls.casting.style,
    kind: cls.casting.kind,
    list: cls.casting.list,
    casterLevel: cl > 0 ? cl + extra.casterLevel : 0,
    perDay,
    domainPerDay,
    known: row.known,
    dc: Array.from({ length: 10 }, (_, lvl) => 10 + lvl + abilityMod(score) + extra.dc),
    maxLevelByAbility,
  };
}
