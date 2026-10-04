import type { Ability, ClassId, Modifier } from "@mesa/srd";

/**
 * Ficha base: só escolhas do jogador. Todo número derivado (CA, ataques,
 * resistências, perícias…) sai de `deriveCharacter`, igual no web e no server.
 */
export type CharacterBase = {
  name: string;
  raceId: string;
  /** "LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE". */
  alignment: string;
  /** Valores antes dos ajustes raciais. */
  abilities: Record<Ability, number>;
  abilityMethod: "pointbuy" | "rolled";
  /** +1 a cada 4 níveis de personagem, na ordem em que foram ganhos. */
  abilityIncreases: Ability[];
  /** Um item por nível de personagem; `hp` = resultado do dado de vida naquele nível. */
  levels: { classId: ClassId; hp: number }[];
  /** Graduações por perícia (fora de classe pode ter meia graduação). */
  skills: Record<string, number>;
  /** `choice`: arma (id), perícia (id), escola de magia… conforme o talento. */
  feats: { id: string; choice?: string }[];
  equipment: {
    armorId: string | null;
    shieldId: string | null;
    weapons: string[];
    gear: { name: string; qty: number; weight: number }[];
  };
  /** Clérigo: 2 domínios. */
  domains: string[];
  /**
   * Magias por classe: `known` = conhecidas (bardo/feiticeiro) ou grimório (mago);
   * `prepared[n]` = preparadas no nível n (pode repetir).
   */
  spells: Partial<Record<ClassId, { known: string[]; prepared: string[][] }>>;
  hp: { current: number; nonlethal: number; temp: number };
  languages: string[];
  notes: string;
};

/** Buff, condição ou outro efeito ativo sobre a criatura. */
export type ActiveEffect = {
  id: string;
  sourceName: string;
  modifiers: Modifier[];
  conditionKey?: string;
};

export const ALIGNMENTS = ["LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE"] as const;

export function emptyCharacter(): CharacterBase {
  return {
    name: "",
    raceId: "human",
    alignment: "N",
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    abilityMethod: "pointbuy",
    abilityIncreases: [],
    levels: [],
    skills: {},
    feats: [],
    equipment: { armorId: null, shieldId: null, weapons: [], gear: [] },
    domains: [],
    spells: {},
    hp: { current: 0, nonlethal: 0, temp: 0 },
    languages: [],
    notes: "",
  };
}
