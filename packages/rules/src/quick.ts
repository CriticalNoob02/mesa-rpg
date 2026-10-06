import { ABILITIES, type Ability, type ClassId, type Spell, type SrdCore } from "@mesa/srd";
import { type CharacterBase, emptyCharacter } from "./character";
import { damageExpr, type NpcStats } from "./combat";
import { deriveCharacter } from "./derive";
import { assignFeats, checkPrerequisites, isMonkBonusFeat, type PrereqContext } from "./feats";
import { isWeaponProficient } from "./proficiency";

/**
 * Personagem pronto em uma tela: o jogador escolhe nome, raça e classe; o resto
 * sai de um modelo por classe (atributos, perícias, talentos, equipamento
 * inicial e magias), sempre válido pelas regras. Subir de nível também é
 * automático. Tudo continua editável no modo avançado.
 */

type Template = {
  /** Ordem para distribuir 15/14/13/12/10/8 (custo 25 no point-buy). */
  abilities: Ability[];
  alignment: string;
  skills: string[];
  /** Talentos na ordem de preferência; `choice` com "$weapon" usa a arma principal. */
  feats: { id: string; choice?: string }[];
  weapons: string[];
  armor: string | null;
  shield: string | null;
  gear: string[];
  domains?: [string, string];
  /** Magias por nível na ordem de preferência (o resto da lista entra depois). */
  spells?: string[][];
};

const ARRAY = [15, 14, 13, 12, 10, 8];
const BASIC_GEAR = ["backpack-empty", "bedroll", "waterskin", "rations-trail-per-day"];

const ARCANE_SPELLS = [
  [
    "detect-magic",
    "light",
    "ray-of-frost",
    "mage-hand",
    "prestidigitation",
    "read-magic",
    "daze",
    "acid-splash",
  ],
  [
    "magic-missile",
    "mage-armor",
    "sleep",
    "shield",
    "color-spray",
    "grease",
    "burning-hands",
    "charm-person",
  ],
  [
    "scorching-ray",
    "mirror-image",
    "invisibility",
    "web",
    "glitterdust",
    "bulls-strength",
    "cats-grace",
  ],
  ["fireball", "haste", "lightning-bolt", "dispel-magic"],
];

export const CLASS_TEMPLATES: Record<ClassId, Template> = {
  barbarian: {
    abilities: ["str", "con", "dex", "wis", "cha", "int"],
    alignment: "CN",
    skills: ["climb", "intimidate", "jump", "listen", "survival", "swim"],
    feats: [
      { id: "power-attack" },
      { id: "cleave" },
      { id: "weapon-focus", choice: "$weapon" },
      { id: "great-cleave" },
    ],
    weapons: ["greataxe", "javelin"],
    armor: "hide",
    shield: null,
    gear: BASIC_GEAR,
  },
  bard: {
    abilities: ["cha", "dex", "con", "int", "wis", "str"],
    alignment: "CG",
    skills: [
      "perform.sing",
      "diplomacy",
      "bluff",
      "gather-information",
      "listen",
      "tumble",
      "sense-motive",
      "knowledge.local",
    ],
    feats: [
      { id: "improved-initiative" },
      { id: "dodge" },
      { id: "weapon-finesse" },
      { id: "combat-casting" },
    ],
    weapons: ["rapier", "shortbow"],
    armor: "leather",
    shield: null,
    gear: BASIC_GEAR,
    spells: [
      [
        "detect-magic",
        "light",
        "prestidigitation",
        "ghost-sound",
        "mage-hand",
        "read-magic",
        "daze",
      ],
      ["cure-light-wounds", "charm-person", "sleep", "grease", "silent-image"],
      ["invisibility", "glitterdust", "cure-moderate-wounds", "sound-burst", "mirror-image"],
      ["haste", "dispel-magic", "cure-serious-wounds"],
    ],
  },
  cleric: {
    abilities: ["wis", "con", "str", "cha", "dex", "int"],
    alignment: "N",
    skills: ["concentration", "heal", "knowledge.religion", "spellcraft", "diplomacy"],
    feats: [{ id: "improved-initiative" }, { id: "extra-turning" }, { id: "combat-casting" }],
    weapons: ["mace-heavy", "crossbow-light"],
    armor: "scale-mail",
    shield: "shield-heavy-wooden",
    gear: ["backpack-empty", "holy-symbol-wooden", "waterskin"],
    domains: ["healing", "protection"],
    spells: [
      ["guidance", "resistance", "light", "detect-magic", "virtue", "create-water"],
      ["bless", "cure-light-wounds", "shield-of-faith", "divine-favor", "sanctuary"],
      ["cure-moderate-wounds", "bulls-strength", "spiritual-weapon", "hold-person"],
      ["prayer", "dispel-magic", "magic-vestment", "cure-serious-wounds"],
    ],
  },
  druid: {
    abilities: ["wis", "con", "dex", "int", "cha", "str"],
    alignment: "N",
    skills: ["concentration", "handle-animal", "knowledge.nature", "spot", "listen", "survival"],
    feats: [{ id: "improved-initiative" }, { id: "combat-casting" }, { id: "natural-spell" }],
    weapons: ["scimitar", "sling"],
    armor: "hide",
    shield: "shield-heavy-wooden",
    gear: BASIC_GEAR,
    spells: [
      ["guidance", "resistance", "detect-magic", "light", "create-water", "cure-minor-wounds"],
      ["entangle", "cure-light-wounds", "produce-flame", "faerie-fire", "magic-fang", "goodberry"],
      ["barkskin", "flame-blade", "bears-endurance", "cats-grace"],
    ],
  },
  fighter: {
    abilities: ["str", "con", "dex", "wis", "int", "cha"],
    alignment: "N",
    skills: ["climb", "jump", "intimidate", "ride", "swim"],
    feats: [
      { id: "power-attack" },
      { id: "weapon-focus", choice: "$weapon" },
      { id: "cleave" },
      { id: "improved-initiative" },
      { id: "dodge" },
      { id: "weapon-specialization", choice: "$weapon" },
      { id: "great-cleave" },
      { id: "improved-critical", choice: "$weapon" },
    ],
    weapons: ["longsword", "shortbow"],
    armor: "chainmail",
    shield: "shield-heavy-wooden",
    gear: [],
  },
  monk: {
    abilities: ["wis", "dex", "str", "con", "int", "cha"],
    alignment: "LN",
    skills: ["tumble", "move-silently", "hide", "listen", "spot", "jump", "balance", "climb"],
    feats: [
      { id: "stunning-fist" },
      { id: "improved-initiative" },
      { id: "dodge" },
      { id: "combat-reflexes" },
      { id: "mobility" },
    ],
    weapons: ["unarmed-strike", "quarterstaff", "sling"],
    armor: null,
    shield: null,
    gear: BASIC_GEAR,
  },
  paladin: {
    abilities: ["str", "cha", "con", "wis", "dex", "int"],
    alignment: "LG",
    skills: ["diplomacy", "ride", "heal", "sense-motive", "concentration"],
    feats: [
      { id: "power-attack" },
      { id: "cleave" },
      { id: "weapon-focus", choice: "$weapon" },
      { id: "improved-initiative" },
    ],
    weapons: ["longsword", "lance"],
    armor: "scale-mail",
    shield: "shield-heavy-wooden",
    gear: [],
    spells: [
      [],
      ["bless", "divine-favor", "cure-light-wounds"],
      ["bulls-strength", "eagles-splendor"],
      ["prayer", "heal-mount"],
    ],
  },
  ranger: {
    abilities: ["dex", "wis", "str", "con", "int", "cha"],
    alignment: "N",
    skills: ["survival", "spot", "listen", "hide", "move-silently", "search", "climb"],
    feats: [
      { id: "point-blank-shot" },
      { id: "precise-shot" },
      { id: "rapid-shot" },
      { id: "weapon-focus", choice: "$weapon" },
    ],
    weapons: ["longbow", "sword-short"],
    armor: "studded-leather",
    shield: null,
    gear: BASIC_GEAR,
    spells: [
      [],
      ["entangle", "magic-fang", "resist-energy", "longstrider"],
      ["barkskin", "cats-grace", "bears-endurance"],
    ],
  },
  rogue: {
    abilities: ["dex", "int", "con", "wis", "cha", "str"],
    alignment: "N",
    skills: [
      "hide",
      "move-silently",
      "search",
      "disable-device",
      "open-lock",
      "spot",
      "listen",
      "tumble",
      "bluff",
      "sleight-of-hand",
      "use-magic-device",
    ],
    feats: [
      { id: "improved-initiative" },
      { id: "weapon-finesse" },
      { id: "dodge" },
      { id: "point-blank-shot" },
      { id: "mobility" },
    ],
    weapons: ["rapier", "shortbow"],
    armor: "leather",
    shield: null,
    gear: ["backpack-empty", "thieves-tools", "waterskin"],
  },
  sorcerer: {
    abilities: ["cha", "dex", "con", "wis", "int", "str"],
    alignment: "N",
    skills: ["concentration", "spellcraft", "bluff", "knowledge.arcana"],
    feats: [
      { id: "improved-initiative" },
      { id: "combat-casting" },
      { id: "toughness" },
      { id: "dodge" },
    ],
    weapons: ["dagger", "crossbow-light"],
    armor: null,
    shield: null,
    gear: [...BASIC_GEAR, "spell-component-pouch"],
    spells: ARCANE_SPELLS,
  },
  wizard: {
    abilities: ["int", "dex", "con", "wis", "cha", "str"],
    alignment: "N",
    skills: [
      "concentration",
      "spellcraft",
      "knowledge.arcana",
      "decipher-script",
      "knowledge.the-planes",
      "knowledge.history",
    ],
    feats: [
      { id: "improved-initiative" },
      { id: "toughness" },
      { id: "extend-spell" },
      { id: "combat-casting" },
      { id: "empower-spell" },
    ],
    weapons: ["quarterstaff", "crossbow-light"],
    armor: null,
    shield: null,
    gear: [...BASIC_GEAR, "spell-component-pouch"],
    spells: ARCANE_SPELLS,
  },
};

export type QuickInput = { name: string; raceId: string; classId: ClassId };

export function quickCharacter(
  input: QuickInput,
  srd: SrdCore,
  spells: Spell[] = [],
): CharacterBase {
  const t = CLASS_TEMPLATES[input.classId];
  const cls = srd.classes.find((c) => c.id === input.classId)!;
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, 10])) as Record<Ability, number>;
  t.abilities.forEach((a, i) => {
    abilities[a] = ARRAY[i]!;
  });
  const gear = t.gear
    .map((id) => srd.gear.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => !!g)
    .map((g) => ({ name: g.namePt ?? g.name, qty: 1, weight: g.weight }));
  let base: CharacterBase = {
    ...emptyCharacter(),
    name: input.name.trim(),
    raceId: input.raceId,
    alignment: t.alignment,
    abilities,
    abilityMethod: "pointbuy",
    levels: [{ classId: input.classId, hp: cls.hitDie }],
    equipment: { armorId: t.armor, shieldId: t.shield, weapons: [...t.weapons], gear },
    domains: t.domains ? [...t.domains] : [],
  };
  base = lighten(base, srd);
  base = fillAutomatic(base, srd, spells);
  const d = deriveCharacter(base, [], srd);
  return { ...base, hp: { current: d.hp.total, nonlethal: 0, temp: 0 } };
}

/** Sobe um nível na classe dada (ou na mais alta), com PV na média e escolhas automáticas. */
export function quickLevelUp(
  base: CharacterBase,
  srd: SrdCore,
  spells: Spell[] = [],
  classId?: ClassId,
): CharacterBase {
  if (base.levels.length >= 20) return base;
  const target = classId ?? mainClass(base);
  const cls = srd.classes.find((c) => c.id === target)!;
  const before = deriveCharacter(base, [], srd).hp.total;
  const levels = [...base.levels, { classId: target, hp: Math.floor(cls.hitDie / 2) + 1 }];
  const t = CLASS_TEMPLATES[mainClass(base)];
  const increases = [...base.abilityIncreases];
  while (increases.length < Math.floor(levels.length / 4)) increases.push(t.abilities[0]!);
  let next: CharacterBase = { ...base, levels, abilityIncreases: increases };
  if (target === "cleric" && next.domains.length === 0)
    next.domains = [...CLASS_TEMPLATES.cleric.domains!];
  next = fillAutomatic(next, srd, spells);
  const after = deriveCharacter(next, [], srd).hp.total;
  return {
    ...next,
    hp: { ...next.hp, current: Math.min(next.hp.current + (after - before), after + next.hp.temp) },
  };
}

export type QuickNpcInput = QuickInput & { level: number };

/**
 * NPC pronto de qualquer nível: personagem do modelo da classe subido até
 * `level`, convertido no bloco simples de NPC (ND = nível, classe de PJ).
 */
export function quickNpc(
  input: QuickNpcInput,
  srd: SrdCore,
  spells: Spell[] = [],
): { base: CharacterBase; stats: NpcStats; speed: number } {
  let base = quickCharacter(input, srd, spells);
  const level = Math.max(1, Math.min(20, Math.floor(input.level)));
  while (base.levels.length < level) base = quickLevelUp(base, srd, spells, input.classId);
  const d = deriveCharacter(base, [], srd);
  return {
    base,
    speed: d.speed.total,
    stats: {
      hp: d.hp.total,
      hpMax: d.hp.total,
      ac: d.ac.total.total,
      touch: d.ac.touch,
      flatFooted: d.ac.flatFooted,
      init: d.initiative.total,
      fort: d.saves.fort.total,
      ref: d.saves.ref.total,
      will: d.saves.will.total,
      attacks: d.attacks.slice(0, 10).map((a) => ({
        name: a.name,
        bonus: a.bonuses[0] ?? a.attack.total,
        damage: damageExpr(a.damageDice, a.damage.total),
        critical: a.critical,
      })),
      cr: String(level),
    },
  };
}

/** Personagem fraco (ex. Pequeno com For baixa): tira peso até carga média no máximo. */
function lighten(base: CharacterBase, srd: SrdCore): CharacterBase {
  let next = base;
  const heavy = () => {
    const c = deriveCharacter(next, [], srd).load.category;
    return c === "heavy" || c === "overloaded";
  };
  const steps: ((b: CharacterBase) => CharacterBase)[] = [
    ...base.equipment.gear.map(() => (b: CharacterBase) => ({
      ...b,
      equipment: { ...b.equipment, gear: b.equipment.gear.slice(0, -1) },
    })),
    (b) => ({ ...b, equipment: { ...b.equipment, shieldId: null } }),
    (b) => ({ ...b, equipment: { ...b.equipment, armorId: null } }),
  ];
  for (const step of steps) {
    if (!heavy()) break;
    next = step(next);
  }
  return next;
}

function mainClass(base: CharacterBase): ClassId {
  const count = new Map<ClassId, number>();
  for (const l of base.levels) count.set(l.classId, (count.get(l.classId) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? base.levels[0]!.classId;
}

/** Completa perícias, talentos e magias que ainda têm espaço, sem tirar escolhas existentes. */
function fillAutomatic(base: CharacterBase, srd: SrdCore, spells: Spell[]): CharacterBase {
  const t = CLASS_TEMPLATES[mainClass(base)];
  let next = { ...base, skills: { ...base.skills }, feats: [...base.feats] };

  // Perícias: de classe, na ordem do modelo, até o máximo; depois as outras de classe.
  let d = deriveCharacter(next, [], srd);
  let left = d.skillPoints.total - d.skillPoints.spent;
  const classSkills = d.skills.filter((s) => s.classSkill);
  const order = [
    ...t.skills.map((id) => classSkills.find((s) => s.id === id)).filter((s) => !!s),
    ...classSkills.filter((s) => !t.skills.includes(s.id) && !s.parent),
  ];
  for (const s of order) {
    if (left <= 0) break;
    const have = next.skills[s.id] ?? 0;
    const add = Math.min(left, s.maxRanks - have);
    if (add > 0) {
      next.skills[s.id] = have + add;
      left -= add;
    }
  }

  // Talentos: preferidos do modelo que cabem e têm pré-requisito; Vitalidade completa o resto.
  const weapon =
    base.equipment.weapons.find((w) => w !== "unarmed-strike") ?? base.equipment.weapons[0];
  const wanted = [...t.feats, { id: "toughness" }].map((f) => ({
    id: f.id,
    ...(f.choice ? { choice: f.choice === "$weapon" ? weapon : f.choice } : {}),
  }));
  for (let guard = 0; guard < 40; guard++) {
    d = deriveCharacter(next, [], srd);
    const slots = assignFeats(next.feats, d.feats.slots, srd).remaining;
    if (Object.values(slots).every((n) => n <= 0)) break;
    const ctx = prereqContext(next, d, srd);
    const pick = wanted.find((w) => {
      const feat = srd.feats.find((f) => f.id === w.id);
      if (!feat || d.feats.granted.includes(w.id)) return false;
      if (!feat.stack && next.feats.some((f) => f.id === w.id && f.choice === w.choice))
        return false;
      if (feat.choice && !w.choice) return false;
      const trial = [...next.feats, w];
      if (assignFeats(trial, d.feats.slots, srd).overflow.length) return false;
      if (isMonkBonusFeat(w.id) && (d.feats.slots.monk ?? 0) > 0) return true;
      return checkPrerequisites(feat, w.choice, ctx, srd).every((r) => r.ok !== false);
    });
    if (!pick) break;
    next.feats.push(pick);
  }

  // Magias: conhecidas (bardo/feiticeiro), grimório (mago) e preparadas.
  if (spells.length && t.spells) {
    d = deriveCharacter(next, [], srd);
    const nextSpells = { ...next.spells };
    for (const c of d.spellcasting) {
      const pref = CLASS_TEMPLATES[c.classId].spells ?? [];
      const listOf = (lvl: number) => {
        const onList = spells.filter((s) => s.levels[c.list] === lvl).map((s) => s.id);
        const first = (pref[lvl] ?? []).filter((id) => onList.includes(id));
        return [...first, ...onList.filter((id) => !first.includes(id)).sort()];
      };
      const chosen = {
        known: [...(nextSpells[c.classId]?.known ?? [])],
        prepared: [] as string[][],
      };
      const levels = c.perDay
        .map((n, lvl) => (n == null ? null : lvl))
        .filter((x): x is number => x !== null);
      if (c.style === "spontaneous" && c.known) {
        for (const lvl of levels) {
          const max = c.known[lvl] ?? 0;
          const have = chosen.known.filter((id) => listOf(lvl).includes(id));
          for (const id of listOf(lvl)) {
            if (have.length >= max) break;
            if (!chosen.known.includes(id)) {
              chosen.known.push(id);
              have.push(id);
            }
          }
        }
      }
      if (c.classId === "wizard") {
        // Grimório: todos os truques + 3 + Int no 1º nível; +2 por nível de mago.
        const intMod = Math.floor((d.abilities.int.score.total - 10) / 2);
        const wanted1 = 3 + Math.max(0, intMod) + 2 * (c.classLevel - 1);
        for (const id of listOf(0)) if (!chosen.known.includes(id)) chosen.known.push(id);
        const book = chosen.known.filter((id) => !listOf(0).includes(id));
        for (const lvl of levels.filter((l) => l > 0)) {
          for (const id of listOf(lvl)) {
            if (book.length >= wanted1) break;
            if (!chosen.known.includes(id)) {
              chosen.known.push(id);
              book.push(id);
            }
          }
        }
      }
      if (c.style === "prepared") {
        const domainSpells = (lvl: number) =>
          next.domains
            .map((dm) => srd.domains.find((x) => x.id === dm)?.spells[lvl - 1]?.id)
            .filter((x): x is string => !!x);
        for (const lvl of levels) {
          const slots = c.perDay[lvl] ?? 0;
          const pool =
            c.classId === "wizard"
              ? listOf(lvl).filter((id) => chosen.known.includes(id))
              : listOf(lvl);
          const list: string[] = [];
          for (let i = 0; i < slots && pool.length; i++) list.push(pool[i % pool.length]!);
          if ((c.domainPerDay[lvl] ?? 0) > 0) {
            const dom = domainSpells(lvl)[0];
            if (dom) list.push(dom);
          }
          chosen.prepared[lvl] = list;
        }
      }
      nextSpells[c.classId] = chosen;
    }
    next = { ...next, spells: nextSpells };
  }
  return next;
}

function prereqContext(
  base: CharacterBase,
  d: ReturnType<typeof deriveCharacter>,
  srd: SrdCore,
): PrereqContext {
  const classIds = d.classLevels.map((c) => c.classId);
  return {
    abilities: Object.fromEntries(
      ABILITIES.map((a) => [a, d.abilities[a].score.total]),
    ) as PrereqContext["abilities"],
    bab: d.bab,
    totalLevel: d.totalLevel,
    classLevels: Object.fromEntries(d.classLevels.map((c) => [c.classId, c.level])),
    casterLevel: Math.max(0, ...d.spellcasting.map((s) => s.casterLevel)),
    skillRanks: base.skills,
    feats: base.feats,
    isProficient: (id) => {
      const w = srd.weapons.find((x) => x.id === id);
      return !!w && isWeaponProficient(w, { classIds, raceId: base.raceId, feats: base.feats });
    },
  };
}
