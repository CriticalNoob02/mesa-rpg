import type { CharacterBase } from "@mesa/rules";
import { ABILITIES, type ClassId, SRD } from "@mesa/srd";
import { z } from "zod";
import { singleLine } from "./text";

const classIds = SRD.classes.map((c) => c.id) as [ClassId, ...ClassId[]];
const id = z.string().min(1).max(80);
const int = (min: number, max: number) => z.number().int().min(min).max(max);

/**
 * Forma da ficha (tipos e tamanhos). As regras do jogo ficam no
 * `validateCharacter` do @mesa/rules; campos desconhecidos são descartados.
 */
export const characterBaseSchema = z.object({
  name: singleLine(60),
  raceId: id,
  alignment: z.string().max(2),
  abilities: z.object(
    Object.fromEntries(ABILITIES.map((a) => [a, int(1, 50)])) as Record<
      (typeof ABILITIES)[number],
      z.ZodNumber
    >,
  ),
  abilityMethod: z.enum(["pointbuy", "rolled"]),
  abilityIncreases: z.array(z.enum(ABILITIES)).max(5),
  levels: z.array(z.object({ classId: z.enum(classIds), hp: int(0, 100) })).max(20),
  skills: z
    .record(id, z.number().min(0).max(23))
    .refine((r) => Object.keys(r).length <= 120, "Perícias demais."),
  feats: z.array(z.object({ id, choice: id.optional() })).max(60),
  equipment: z.object({
    armorId: id.nullable(),
    shieldId: id.nullable(),
    weapons: z.array(id).max(20),
    gear: z
      .array(
        z.object({
          name: singleLine(60),
          qty: int(1, 9999),
          weight: z.number().min(0).max(10_000),
        }),
      )
      .max(100),
  }),
  domains: z.array(id).max(2),
  spells: z.partialRecord(
    z.enum(classIds),
    z.object({ known: z.array(id).max(300), prepared: z.array(z.array(id).max(40)).max(10) }),
  ),
  hp: z.object({ current: int(-50, 9999), nonlethal: int(0, 9999), temp: int(0, 9999) }),
  languages: z.array(singleLine(30)).max(20),
  notes: z.string().max(5000),
}) satisfies z.ZodType<CharacterBase, unknown>;
