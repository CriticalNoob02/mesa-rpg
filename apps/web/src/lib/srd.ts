import type { CharacterView } from "@mesa/protocol";
import { SRD } from "@mesa/srd";

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
