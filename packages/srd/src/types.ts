/**
 * Esquema dos dados SRD 3.5 usados pela mesa. Os JSON em `data/` são gerados por
 * `scripts/import-srd.ts` a partir da base SQLite do Andargor (OGL); raças e
 * condições são escritas à mão em `src/` (a base não as tem em forma estruturada).
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

/** Tipos de bônus do 3.5. Iguais não somam (vale o maior), exceto os de `STACKING_TYPES`. */
export const BONUS_TYPES = [
  "alchemical",
  "armor",
  "circumstance",
  "competence",
  "deflection",
  "dodge",
  "enhancement",
  "insight",
  "luck",
  "morale",
  "natural",
  "profane",
  "racial",
  "resistance",
  "sacred",
  "shield",
  "size",
  "untyped",
] as const;
export type BonusType = (typeof BONUS_TYPES)[number];

/**
 * Alvos de modificador. Atributos (`str`…), CA, ataque, dano, resistências,
 * iniciativa, deslocamento (pés), perícias (`skill.<id>` ou `skill.all`), PV
 * máximo, nível de conjurador e CD das magias.
 */
export type StatKey =
  | Ability
  | "ac"
  | "attack"
  | "attack.melee"
  | "attack.ranged"
  | "damage"
  | "damage.melee"
  | "save.all"
  | "save.fort"
  | "save.ref"
  | "save.will"
  | "init"
  | "speed"
  | "hpMax"
  | "casterLevel"
  | "spellDc"
  | "grapple"
  | "skill.all"
  | `skill.${string}`;

export type Modifier = { stat: StatKey; value: number; type: BonusType };

/** Efeitos que mudam regra em vez de somar número. */
export type ConditionFlag =
  | "loseDexToAc" // perde Des na CA (desprevenido, atordoado, cego…)
  | "halfSpeed" // exausto, enredado, cego
  | "noMove" // paralisado, imobilizado, atordoado…
  | "noActions" // paralisado, inconsciente, atordoado (sem ações)
  | "singleAction" // fraco, nauseado: só ação padrão OU de movimento
  | "noRun" // fatigado: não corre nem investe
  | "helpless"; // indefeso: Des efetiva 0

export type Condition = {
  key: string;
  name: string;
  namePt: string;
  summaryPt: string;
  modifiers: Modifier[];
  flags: ConditionFlag[];
};

export type Size = "small" | "medium";

export type Race = {
  id: string;
  name: string;
  namePt: string;
  size: Size;
  /** Deslocamento base em pés. */
  speed: number;
  abilityAdjustments: Partial<Record<Ability, number>>;
  /** Anão: armadura média/pesada e carga não reduzem o deslocamento. */
  speedIgnoresLoad?: boolean;
  modifiers: Modifier[];
  bonusFeats: number;
  /** Pontos de perícia extras: no 1º nível e por nível depois. */
  bonusSkillPoints: { first: number; perLevel: number };
  favoredClass: string | "any";
  languages: string[];
  bonusLanguages: string[];
  traitsPt: string[];
};

export type ClassLevelRow = {
  level: number;
  /** Mesmas habilidades de `special`, em português (mesma ordem). */
  specialPt?: string[];
  bab: number;
  fort: number;
  ref: number;
  will: number;
  special: string[];
  /** Magias por dia por nível de magia (0–9). null = não conjura esse nível; "+1" de domínio fica em `domainSlots`. */
  slots: (number | null)[] | null;
  domainSlots: number[] | null;
  /** Magias conhecidas (bardo, feiticeiro). */
  known: (number | null)[] | null;
  /** Monge: bônus na CA, deslocamento extra (pés), dano desarmado. */
  monk?: { acBonus: number; speedBonus: number; unarmedDamage: string; flurry: string };
};

export type ClassId =
  | "barbarian"
  | "bard"
  | "cleric"
  | "druid"
  | "fighter"
  | "monk"
  | "paladin"
  | "ranger"
  | "rogue"
  | "sorcerer"
  | "wizard";

export type SrdClass = {
  id: ClassId;
  name: string;
  namePt: string;
  hitDie: number;
  skillPoints: number;
  /** ids de perícia (`knowledge.arcana`, `craft`…); `knowledge.*` = todas. */
  classSkills: string[];
  alignment: string;
  casting: null | {
    ability: Ability;
    kind: "arcane" | "divine";
    /** Prepara do livro/lista (mago, clérigo…) ou conjura o que conhece (bardo, feiticeiro). */
    style: "prepared" | "spontaneous";
    /** Nome da lista de magias na coluna `level` das magias (ex. "Sorcerer/Wizard"). */
    list: string;
    /** Paladino/patrulheiro: nível de conjurador = metade do nível da classe. */
    halfCasterLevel?: boolean;
  };
  proficiencies: string;
  proficienciesPt?: string;
  alignmentPt?: string;
  levels: ClassLevelRow[];
};

export type Skill = {
  id: string;
  name: string;
  namePt: string;
  ability: Ability | null;
  trainedOnly: boolean;
  armorCheck: boolean;
  /** Perícia com especialização (Ofício, Conhecimento, Atuação, Profissão). */
  parent?: string;
};

export type Feat = {
  id: string;
  name: string;
  namePt?: string;
  benefitPt?: string;
  /** Mesmas cláusulas de `prerequisite`, na mesma ordem (separadas por ", "). */
  prerequisitePt?: string | null;
  choicePt?: string | null;
  types: string[];
  multiple: boolean;
  stack: boolean;
  choice: string | null;
  prerequisite: string | null;
  benefit: string;
};

export type Weapon = {
  id: string;
  name: string;
  namePt?: string;
  damageTypePt?: string;
  proficiency: "simple" | "martial" | "exotic";
  /** Categoria de empunhadura: leve, uma mão, duas mãos, distância, desarmado. */
  handedness: "unarmed" | "light" | "one-handed" | "two-handed" | "ranged";
  cost: string;
  damage: { small: string | null; medium: string | null };
  critical: { range: number; multiplier: number };
  rangeIncrement: number | null;
  weight: number;
  damageType: string;
};

export type Armor = {
  id: string;
  name: string;
  namePt?: string;
  kind: "light" | "medium" | "heavy" | "shield";
  cost: string;
  bonus: number;
  maxDex: number | null;
  checkPenalty: number;
  spellFailure: number;
  /** Deslocamento com a armadura para base 30 e 20 pés (null = não reduz). */
  speed30: number | null;
  speed20: number | null;
  weight: number;
};

export type Gear = { id: string; name: string; namePt?: string; cost: string; weight: number };

/** Magias do domínio por nível (1–9); `id` null quando a magia não está no SRD 3.5. */
export type Domain = {
  id: string;
  name: string;
  namePt?: string;
  grantedPowers: string;
  grantedPowersPt?: string;
  spells: { name: string; id: string | null }[];
};

export type Spell = {
  id: string;
  name: string;
  school: string;
  subschool: string | null;
  descriptor: string | null;
  /** Lista → nível, ex. { "Sorcerer/Wizard": 3, "Cleric": 2, "Fire": 3 }. */
  levels: Record<string, number>;
  components: string;
  castingTime: string;
  range: string;
  target: string | null;
  area: string | null;
  effect: string | null;
  duration: string;
  savingThrow: string | null;
  spellResistance: string | null;
  summary: string;
  description: string;
  /** Tradução para português (mesmos campos de texto). */
  pt?: SpellPt;
};

export type SpellPt = {
  name: string;
  summary: string;
  description: string;
  castingTime: string;
  range: string;
  duration: string;
  components: string;
  target: string | null;
  area: string | null;
  effect: string | null;
  savingThrow: string | null;
  spellResistance: string | null;
  subschool: string | null;
  descriptor: string | null;
  /** Lista → nome da lista em português (ex. "Sorcerer/Wizard" → "Feiticeiro/Mago"). */
  lists: Record<string, string>;
};

export type SrdCore = {
  races: Race[];
  classes: SrdClass[];
  skills: Skill[];
  feats: Feat[];
  weapons: Weapon[];
  armor: Armor[];
  gear: Gear[];
  domains: Domain[];
  conditions: Condition[];
};
