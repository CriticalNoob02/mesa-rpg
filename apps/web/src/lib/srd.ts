import type { CharacterView } from "@mesa/protocol";
import { type Spell, SRD } from "@mesa/srd";

export const raceName = (id: string) => SRD.races.find((r) => r.id === id)?.namePt ?? id;
export const className = (id: string) => SRD.classes.find((c) => c.id === id)?.namePt ?? id;

/** "Anão Guerreiro 5 / Mago 2" */
export function characterSummary(c: Pick<CharacterView, "raceId" | "classes">) {
  const classes = c.classes.map((x) => `${className(x.classId)} ${x.level}`).join(" / ");
  return `${raceName(c.raceId)} ${classes}`.trim();
}

export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Expressão de d20 com o bônus, no formato que o servidor entende. */
export const d20 = (bonus: number) =>
  bonus === 0 ? "1d20" : `1d20${bonus > 0 ? "+" : ""}${bonus}`;

export const ALIGNMENT_PT: Record<string, string> = {
  LG: "Leal e Bom",
  NG: "Neutro e Bom",
  CG: "Caótico e Bom",
  LN: "Leal e Neutro",
  N: "Neutro",
  CN: "Caótico e Neutro",
  LE: "Leal e Mau",
  NE: "Neutro e Mau",
  CE: "Caótico e Mau",
};

/** Pés → metros (o jogo usa quadrados de 1,5 m). */
export const meters = (feet: number) => `${((feet / 5) * 1.5).toLocaleString("pt-BR")} m`;

export const SCHOOLS_PT: Record<string, string> = {
  Abjuration: "Abjuração",
  Conjuration: "Conjuração",
  Divination: "Adivinhação",
  Enchantment: "Encantamento",
  Evocation: "Evocação",
  Illusion: "Ilusão",
  Necromancy: "Necromancia",
  Transmutation: "Transmutação",
  Universal: "Universal",
};

/** Campos da magia em português (cai no inglês se a tradução faltar). */
export const spellText = (s: Spell) => ({
  name: s.pt?.name ?? s.name,
  summary: s.pt?.summary ?? s.summary,
  description: s.pt?.description ?? s.description,
  castingTime: s.pt?.castingTime ?? s.castingTime,
  range: s.pt?.range ?? s.range,
  duration: s.pt?.duration ?? s.duration,
  components: s.pt?.components ?? s.components,
  savingThrow: s.pt?.savingThrow ?? s.savingThrow,
  spellResistance: s.pt?.spellResistance ?? s.spellResistance,
  target: s.pt?.target ?? s.target,
  area: s.pt?.area ?? s.area,
  effect: s.pt?.effect ?? s.effect,
});

/** Índice do ataque principal: o de maior bônus (ataque rápido e destaques). */
export function bestAttackIndex(attacks: { bonuses: readonly number[] }[]) {
  let best = 0;
  attacks.forEach((a, i) => {
    if ((a.bonuses[0] ?? -99) > (attacks[best]!.bonuses[0] ?? -99)) best = i;
  });
  return best;
}
