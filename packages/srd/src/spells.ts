import corePt from "../data/pt/core.json";
import spellFieldsPt from "../data/pt/spell-fields.json";
import spellsPt from "../data/pt/spells.json";
import spells from "../data/spells.json";
import type { Spell } from "./types";

type FieldMaps = Partial<Record<string, Record<string, string>>>;
const fields = spellFieldsPt as FieldMaps;
const texts = spellsPt as Record<string, { name: string; summary: string; description: string }>;
const lists = ((corePt as { spellLists?: Record<string, string> }).spellLists ?? {}) as Record<
  string,
  string
>;

const tr = (field: string, value: string | null) =>
  value == null ? null : (fields[field]?.[value] ?? value);

/** Magias com a tradução em `pt` (o original fica intacto para as regras). */
export const SPELLS = (spells as unknown as Spell[]).map((s): Spell => {
  const t = texts[s.id];
  if (!t) return s;
  return {
    ...s,
    pt: {
      name: t.name,
      summary: t.summary,
      description: t.description,
      castingTime: tr("castingTime", s.castingTime) ?? s.castingTime,
      range: tr("range", s.range) ?? s.range,
      duration: tr("duration", s.duration) ?? s.duration,
      components: tr("components", s.components) ?? s.components,
      target: tr("target", s.target),
      area: tr("area", s.area),
      effect: tr("effect", s.effect),
      savingThrow: tr("savingThrow", s.savingThrow),
      spellResistance: tr("spellResistance", s.spellResistance),
      subschool: tr("subschool", s.subschool),
      descriptor: tr("descriptor", s.descriptor),
      lists: Object.fromEntries(Object.keys(s.levels).map((l) => [l, lists[l] ?? l])),
    },
  };
});
