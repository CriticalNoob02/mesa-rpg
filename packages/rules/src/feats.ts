import type { Ability, ClassId, Feat, Modifier, SrdCore } from "@mesa/srd";

/** Talentos com efeito numérico fixo. Os situacionais (Ataque Poderoso…) ficam no texto. */
const SKILL_PAIRS: Record<string, [string, string]> = {
  acrobatic: ["jump", "tumble"],
  agile: ["balance", "escape-artist"],
  alertness: ["listen", "spot"],
  "animal-affinity": ["handle-animal", "ride"],
  athletic: ["climb", "swim"],
  deceitful: ["disguise", "forgery"],
  "deft-hands": ["sleight-of-hand", "use-rope"],
  diligent: ["appraise", "decipher-script"],
  investigator: ["gather-information", "search"],
  "magical-aptitude": ["spellcraft", "use-magic-device"],
  negotiator: ["diplomacy", "sense-motive"],
  "nimble-fingers": ["disable-device", "open-lock"],
  persuasive: ["bluff", "intimidate"],
  "self-sufficient": ["heal", "survival"],
  stealthy: ["hide", "move-silently"],
};

const FIXED: Record<string, Modifier[]> = {
  "improved-initiative": [{ stat: "init", value: 4, type: "untyped" }],
  "great-fortitude": [{ stat: "save.fort", value: 2, type: "untyped" }],
  "iron-will": [{ stat: "save.will", value: 2, type: "untyped" }],
  "lightning-reflexes": [{ stat: "save.ref", value: 2, type: "untyped" }],
  toughness: [{ stat: "hpMax", value: 3, type: "untyped" }],
  dodge: [{ stat: "ac", value: 1, type: "dodge" }],
};

/** Modificadores gerais que o talento dá (perícias, iniciativa, resistências, PV, CA). */
export function featModifiers(feat: { id: string; choice?: string }): Modifier[] {
  const pair = SKILL_PAIRS[feat.id];
  if (pair) return pair.map((s) => ({ stat: `skill.${s}`, value: 2, type: "untyped" }));
  if (feat.id === "skill-focus" && feat.choice) {
    return [{ stat: `skill.${feat.choice}`, value: 3, type: "untyped" }];
  }
  return FIXED[feat.id] ?? [];
}

/** Bônus de ataque/dano de talentos por arma (Foco, Especialização e versões maiores). */
export function weaponFeatBonus(feats: { id: string; choice?: string }[], weaponId: string) {
  const has = (id: string) => feats.some((f) => f.id === id && f.choice === weaponId);
  return {
    attack: (has("weapon-focus") ? 1 : 0) + (has("greater-weapon-focus") ? 1 : 0),
    damage: (has("weapon-specialization") ? 2 : 0) + (has("greater-weapon-specialization") ? 2 : 0),
  };
}

/** Talentos que a classe ganha de graça (não gastam espaço). */
export function grantedFeats(levels: Partial<Record<ClassId, number>>): string[] {
  const out: string[] = [];
  if ((levels.wizard ?? 0) >= 1) out.push("scribe-scroll");
  if ((levels.monk ?? 0) >= 1) out.push("improved-unarmed-strike");
  if ((levels.ranger ?? 0) >= 1) out.push("track");
  if ((levels.ranger ?? 0) >= 3) out.push("endurance");
  return out;
}

export type FeatSlotKind = "general" | "fighter" | "wizard" | "monk";
export type FeatSlots = Record<FeatSlotKind, number>;

const MONK_BONUS = [
  "improved-grapple",
  "stunning-fist",
  "combat-reflexes",
  "deflect-arrows",
  "improved-disarm",
  "improved-trip",
];

export function featSlots(
  totalLevel: number,
  levels: Partial<Record<ClassId, number>>,
  raceBonusFeats: number,
): FeatSlots {
  const fighter = levels.fighter ?? 0;
  const monk = levels.monk ?? 0;
  return {
    general: (totalLevel > 0 ? 1 + Math.floor(totalLevel / 3) : 0) + raceBonusFeats,
    fighter: fighter > 0 ? 1 + Math.floor(fighter / 2) : 0,
    wizard: Math.floor((levels.wizard ?? 0) / 5),
    monk: monk >= 6 ? 3 : monk >= 2 ? 2 : monk >= 1 ? 1 : 0,
  };
}

function fits(feat: Feat, kind: FeatSlotKind): boolean {
  if (kind === "general") return true;
  if (kind === "fighter") return feat.types.includes("Fighter");
  if (kind === "wizard") {
    return (
      feat.types.includes("Metamagic") ||
      feat.types.includes("Item Creation") ||
      feat.id === "spell-mastery"
    );
  }
  return MONK_BONUS.includes(feat.id);
}

/**
 * Encaixa os talentos escolhidos nos espaços: primeiro os de espaço restrito
 * (guerreiro, mago, monge), o resto nos gerais. Devolve onde cada um ficou e o
 * que sobrou sem espaço.
 */
export function assignFeats(
  chosen: { id: string; choice?: string }[],
  slots: FeatSlots,
  srd: SrdCore,
) {
  const left = { ...slots };
  const placed: { index: number; slot: FeatSlotKind }[] = [];
  const overflow: number[] = [];
  const special: FeatSlotKind[] = ["monk", "wizard", "fighter"];
  // Quem cabe em menos tipos de espaço vai primeiro.
  const order = chosen
    .map((c, index) => ({ index, feat: srd.feats.find((f) => f.id === c.id) }))
    .sort((a, b) => countFits(a.feat) - countFits(b.feat));
  for (const { index, feat } of order) {
    if (!feat) {
      overflow.push(index);
      continue;
    }
    const slot = [...special, "general" as const].find((k) => left[k] > 0 && fits(feat, k));
    if (!slot) {
      overflow.push(index);
      continue;
    }
    left[slot]--;
    placed.push({ index, slot });
  }
  return { placed: placed.sort((a, b) => a.index - b.index), overflow, remaining: left };

  function countFits(feat?: Feat) {
    if (!feat) return 99;
    return (["general", "fighter", "wizard", "monk"] as const).filter((k) => fits(feat, k)).length;
  }
}

export function isMonkBonusFeat(id: string) {
  return MONK_BONUS.includes(id);
}

/** O que o pré-requisito precisa saber da ficha. */
export type PrereqContext = {
  abilities: Record<Ability, number>;
  bab: number;
  totalLevel: number;
  classLevels: Partial<Record<ClassId, number>>;
  casterLevel: number;
  skillRanks: Record<string, number>;
  feats: { id: string; choice?: string }[];
  isProficient: (weaponId: string) => boolean;
};

export type PrereqResult = { text: string; ok: boolean | null };

const ABILITY_BY_NAME: Record<string, Ability> = {
  str: "str",
  dex: "dex",
  con: "con",
  int: "int",
  wis: "wis",
  cha: "cha",
};

/**
 * Confere cada cláusula do pré-requisito. `ok: null` = cláusula que o motor não
 * sabe avaliar (o mestre decide).
 */
export function checkPrerequisites(
  feat: Feat,
  choice: string | undefined,
  ctx: PrereqContext,
  srd: SrdCore,
): PrereqResult[] {
  if (!feat.prerequisite) return [];
  return feat.prerequisite.split(/,\s*/).map((raw) => {
    const text = raw.trim();
    return { text, ok: evaluate(text) };
  });

  function evaluate(text: string): boolean | null {
    let m = /^(Str|Dex|Con|Int|Wis|Cha) (\d+)$/i.exec(text);
    if (m) return ctx.abilities[ABILITY_BY_NAME[m[1]!.toLowerCase()]!] >= Number(m[2]);
    m = /^base attack bonus \+(\d+)/i.exec(text);
    if (m) return ctx.bab >= Number(m[1]);
    m = /^(caster|character|fighter|wizard) level (\d+)/i.exec(text);
    if (m) {
      const need = Number(m[2]);
      const kind = m[1]!.toLowerCase();
      if (kind === "caster") return ctx.casterLevel >= need;
      if (kind === "character") return ctx.totalLevel >= need;
      return (ctx.classLevels[kind as ClassId] ?? 0) >= need;
    }
    m = /^(.+) (\d+) ranks?$/i.exec(text);
    if (m) {
      const skill = srd.skills.find((s) => s.name.toLowerCase() === m![1]!.toLowerCase());
      return skill ? (ctx.skillRanks[skill.id] ?? 0) >= Number(m[2]) : null;
    }
    if (/^ability to turn or rebuke/i.test(text)) {
      return (ctx.classLevels.cleric ?? 0) >= 1 || (ctx.classLevels.paladin ?? 0) >= 4;
    }
    if (/^wild shape/i.test(text)) return (ctx.classLevels.druid ?? 0) >= 5;
    if (/^(proficiency with selected weapon|proficient with weapon)$/i.test(text)) {
      return choice ? ctx.isProficient(choice) : null;
    }
    m = /^(.+) with selected weapon$/i.exec(text);
    if (m) {
      const id = srd.feats.find((f) => f.name.toLowerCase() === m![1]!.toLowerCase())?.id;
      return !!id && ctx.feats.some((f) => f.id === id && f.choice === choice);
    }
    m = /^(.+?) \((.+)\)$/.exec(text);
    if (m) {
      const id = srd.feats.find((f) => f.name.toLowerCase() === text.toLowerCase())?.id;
      if (id) return ctx.feats.some((f) => f.id === id);
      const base = srd.feats.find((f) => f.name.toLowerCase() === m![1]!.toLowerCase())?.id;
      if (base)
        return ctx.feats.some(
          (f) => f.id === base && f.choice?.toLowerCase() === m![2]!.toLowerCase(),
        );
    }
    const id = srd.feats.find((f) => f.name.toLowerCase() === text.toLowerCase())?.id;
    if (id) return ctx.feats.some((f) => f.id === id) || grantedHas(id);
    return null;
  }

  function grantedHas(id: string) {
    return grantedFeats(ctx.classLevels).includes(id);
  }
}
