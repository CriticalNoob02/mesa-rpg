import {
  ABILITIES,
  type Ability,
  type Armor,
  type ClassId,
  type ConditionFlag,
  type Race,
  type SrdClass,
  type SrdCore,
  type Weapon,
} from "@mesa/srd";
import { carryingCapacity, type LoadCategory, loadCategory } from "./abilities";
import type { ActiveEffect, CharacterBase } from "./character";
import {
  assignFeats,
  type FeatSlots,
  featModifiers,
  featSlots,
  grantedFeats,
  weaponFeatBonus,
} from "./feats";
import { isArmorProficient, isWeaponProficient } from "./proficiency";
import { type Spellcasting, spellcasting } from "./spellcasting";
import { abilityMod, type LabeledModifier, type Part, pick, type Stat, stack } from "./stacking";

export type DerivedSkill = {
  id: string;
  name: string;
  namePt: string;
  ability: Ability | null;
  ranks: number;
  classSkill: boolean;
  maxRanks: number;
  trainedOnly: boolean;
  parent?: string;
  /** Treinada só (sem graduação) não pode ser usada. */
  usable: boolean;
  total: Stat;
};

export type WeaponAttack = {
  weaponId: string;
  name: string;
  kind: "melee" | "ranged";
  /** Bônus de cada ataque da ação de ataque total (iterativos). */
  bonuses: number[];
  attack: Stat;
  damageDice: string;
  damage: Stat;
  critical: string;
  rangeIncrement: number | null;
  proficient: boolean;
};

export type Derived = {
  race: Race;
  size: Race["size"];
  totalLevel: number;
  classLevels: { classId: ClassId; name: string; namePt: string; level: number }[];
  abilities: Record<Ability, { base: number; score: Stat; mod: number }>;
  hp: Stat;
  ac: { total: Stat; touch: number; flatFooted: number; maxDex: number | null };
  bab: number;
  grapple: Stat;
  attacks: WeaponAttack[];
  saves: { fort: Stat; ref: Stat; will: Stat };
  initiative: Stat;
  speed: { base: number; total: number; run: number; notes: string[] };
  load: { weight: number; light: number; medium: number; heavy: number; category: LoadCategory };
  armorCheckPenalty: number;
  arcaneSpellFailure: number;
  skills: DerivedSkill[];
  skillPoints: { total: number; spent: number };
  feats: {
    slots: FeatSlots;
    granted: string[];
    /** Índices de `base.feats` sem espaço disponível. */
    overflow: number[];
    remaining: FeatSlots;
  };
  spellcasting: Spellcasting[];
  specials: { classId: ClassId; level: number; text: string }[];
  flags: ConditionFlag[];
};

const FINESSE = new Set(["rapier", "whip", "chain-spiked"]);
// Armas que somam Força no dano mesmo sendo de distância (arremesso, funda).
const STR_ON_RANGED = (w: Weapon) => w.handedness !== "ranged" || w.id === "sling";
// Arco e funda sofrem a penalidade de Força; bestas não.
const STR_PENALTY_RANGED = (w: Weapon) => /bow|sling/.test(w.id) && !w.id.includes("crossbow");

const SYNERGIES: [from: string, to: string][] = [
  ["bluff", "diplomacy"],
  ["bluff", "intimidate"],
  ["bluff", "sleight-of-hand"],
  ["handle-animal", "ride"],
  ["jump", "tumble"],
  ["knowledge.arcana", "spellcraft"],
  ["knowledge.local", "gather-information"],
  ["knowledge.nobility-and-royalty", "diplomacy"],
  ["sense-motive", "diplomacy"],
  ["tumble", "balance"],
  ["tumble", "jump"],
];

export class RulesError extends Error {
  override name = "RulesError";
}

/**
 * Calcula a ficha inteira a partir das escolhas + efeitos ativos.
 * Simplificações (documentadas): pontos de perícia usam a Int atual; perícia é
 * de classe se for de qualquer classe do personagem.
 */
export function deriveCharacter(
  base: CharacterBase,
  effects: ActiveEffect[],
  srd: SrdCore,
): Derived {
  const race = srd.races.find((r) => r.id === base.raceId);
  if (!race) throw new RulesError(`Raça desconhecida: ${base.raceId}`);
  const small = race.size === "small";

  // ---- níveis por classe
  const levelsByClass: Partial<Record<ClassId, number>> = {};
  for (const l of base.levels) levelsByClass[l.classId] = (levelsByClass[l.classId] ?? 0) + 1;
  const classOf = (id: ClassId): SrdClass => {
    const c = srd.classes.find((x) => x.id === id);
    if (!c) throw new RulesError(`Classe desconhecida: ${id}`);
    return c;
  };
  const classEntries = (Object.entries(levelsByClass) as [ClassId, number][]).map(
    ([id, level]) => ({
      cls: classOf(id),
      level,
    }),
  );
  const totalLevel = base.levels.length;
  const classIds = classEntries.map((e) => e.cls.id);

  // ---- todos os modificadores com rótulo
  const mods: LabeledModifier[] = [
    ...race.modifiers.map((m) => ({ ...m, label: race.namePt })),
    ...effects.flatMap((e) => e.modifiers.map((m) => ({ ...m, label: e.sourceName }))),
    ...base.feats.flatMap((f) => {
      const feat = srd.feats.find((x) => x.id === f.id);
      return featModifiers(f).map((m) => ({ ...m, label: feat?.name ?? f.id }));
    }),
  ];
  const flags = new Set<ConditionFlag>(
    effects.flatMap((e) => srd.conditions.find((c) => c.key === e.conditionKey)?.flags ?? []),
  );

  // ---- atributos
  const abilities = {} as Derived["abilities"];
  for (const a of ABILITIES) {
    const own: LabeledModifier[] = [];
    const racial = race.abilityAdjustments[a] ?? 0;
    if (racial) own.push({ stat: a, value: racial, type: "untyped", label: race.namePt });
    const inc = base.abilityIncreases.filter((x) => x === a).length;
    if (inc) own.push({ stat: a, value: inc, type: "untyped", label: "Aumento por nível" });
    const score = stack([...own, ...pick(mods, a)], base.abilities[a]);
    abilities[a] = { base: base.abilities[a], score, mod: abilityMod(score.total) };
  }
  const helpless = flags.has("helpless");
  const mod = (a: Ability) => (helpless && (a === "dex" || a === "str") ? -5 : abilities[a].mod);

  // ---- equipamento, carga, armadura
  const armor = base.equipment.armorId ? findArmor(base.equipment.armorId) : null;
  const shield = base.equipment.shieldId ? findArmor(base.equipment.shieldId) : null;
  const weapons = base.equipment.weapons.map((id) => {
    const w = srd.weapons.find((x) => x.id === id);
    if (!w) throw new RulesError(`Arma desconhecida: ${id}`);
    return w;
  });
  const weight =
    (armor?.weight ?? 0) +
    (shield?.weight ?? 0) +
    weapons.reduce((s, w) => s + w.weight, 0) +
    base.equipment.gear.reduce((s, g) => s + g.weight * g.qty, 0);
  const cap = carryingCapacity(abilities.str.score.total, race.size);
  const load = loadCategory(weight, cap);
  const loadPenalty = load === "medium" ? -3 : load === "heavy" || load === "overloaded" ? -6 : 0;
  const loadMaxDex = load === "medium" ? 3 : load === "heavy" || load === "overloaded" ? 1 : null;
  const who = { classIds, raceId: race.id, feats: base.feats };
  const armorAcp = (armor?.checkPenalty ?? 0) + (shield?.checkPenalty ?? 0);
  const armorCheckPenalty = Math.min(armorAcp, loadPenalty);
  const nonProficientArmorPenalty = [armor, shield]
    .filter((x): x is Armor => !!x && !isArmorProficient(x, who))
    .reduce((s, x) => s + x.checkPenalty, 0);
  const maxDexCandidates = [armor?.maxDex, shield?.maxDex, loadMaxDex].filter(
    (x): x is number => x != null,
  );
  const maxDex = maxDexCandidates.length ? Math.min(...maxDexCandidates) : null;

  // ---- BBA e resistências por classe (multiclasse soma)
  const bab = classEntries.reduce((s, e) => s + e.cls.levels[e.level - 1]!.bab, 0);
  const classSave = (k: "fort" | "ref" | "will") =>
    classEntries.map((e) => ({
      stat: `save.${k}` as const,
      value: e.cls.levels[e.level - 1]![k],
      type: "untyped" as const,
      label: `${e.cls.namePt} ${e.level}`,
    }));
  const divineGrace =
    (levelsByClass.paladin ?? 0) >= 2 && mod("cha") > 0
      ? [
          {
            stat: "save.all" as const,
            value: mod("cha"),
            type: "untyped" as const,
            label: "Graça divina",
          },
        ]
      : [];
  const save = (k: "fort" | "ref" | "will", a: Ability) =>
    stack([
      ...classSave(k),
      { stat: `save.${k}`, value: mod(a), type: "untyped", label: abilityLabel(a) },
      ...divineGrace,
      ...pick(mods, `save.${k}`, "save.all"),
    ]);

  // ---- CA
  const sizeMod = race.size === "small" ? 1 : 0;
  const dex = mod("dex");
  const dexToAc = maxDex == null ? dex : Math.min(dex, maxDex);
  const loseDex = flags.has("loseDexToAc");
  const monkLevel = levelsByClass.monk ?? 0;
  const monkAc =
    monkLevel > 0 && !armor && !shield && load === "light"
      ? [
          ...(mod("wis") > 0
            ? [
                {
                  stat: "ac" as const,
                  value: mod("wis"),
                  type: "untyped" as const,
                  label: "Sabedoria (monge)",
                },
              ]
            : []),
          {
            stat: "ac" as const,
            value: classOf("monk").levels[monkLevel - 1]!.monk?.acBonus ?? 0,
            type: "untyped" as const,
            label: "Monge",
          },
        ]
      : [];
  const acMods: LabeledModifier[] = [
    ...(armor
      ? [{ stat: "ac" as const, value: armor.bonus, type: "armor" as const, label: armor.name }]
      : []),
    ...(shield
      ? [{ stat: "ac" as const, value: shield.bonus, type: "shield" as const, label: shield.name }]
      : []),
    { stat: "ac", value: dexToAc, type: "untyped", label: "Destreza" },
    ...(sizeMod
      ? [{ stat: "ac" as const, value: sizeMod, type: "size" as const, label: "Tamanho" }]
      : []),
    ...monkAc,
    ...pick(mods, "ac"),
  ];
  const acTotal = stack(
    loseDex
      ? acMods.filter((m) => !(m.label === "Destreza" && m.value > 0) && m.type !== "dodge")
      : acMods,
    10,
  );
  const touch = stack(
    acMods.filter(
      (m) =>
        !["armor", "shield", "natural"].includes(m.type) &&
        !(loseDex && ((m.label === "Destreza" && m.value > 0) || m.type === "dodge")),
    ),
    10,
  ).total;
  const flatFooted = stack(
    acMods.filter((m) => !(m.label === "Destreza" && m.value > 0) && m.type !== "dodge"),
    10,
  ).total;

  // ---- ataques
  const attacks = weapons.map((w) => weaponAttack(w));
  const grapple = stack([
    { stat: "grapple", value: bab, type: "untyped", label: "BBA" },
    { stat: "grapple", value: mod("str"), type: "untyped", label: "Força" },
    ...(race.size === "small"
      ? [{ stat: "grapple" as const, value: -4, type: "untyped" as const, label: "Tamanho" }]
      : []),
    ...pick(mods, "grapple"),
  ]);

  // ---- PV
  const hp = stack([
    ...base.levels.map((l, i) => ({
      stat: "hpMax" as const,
      value: Math.max(1, l.hp + mod("con")),
      type: "untyped" as const,
      label: `Nível ${i + 1} (${classOf(l.classId).namePt})`,
    })),
    ...pick(mods, "hpMax"),
  ]);

  // ---- deslocamento
  const speedNotes: string[] = [];
  let speedBase = race.speed;
  const slowed = (s: number) => (s >= 30 ? 20 : s >= 20 ? 15 : s);
  if (!race.speedIgnoresLoad) {
    if (armor && (armor.kind === "medium" || armor.kind === "heavy")) {
      const reduced = race.speed >= 30 ? armor.speed30 : armor.speed20;
      if (reduced != null && reduced < speedBase) {
        speedBase = reduced;
        speedNotes.push(`Armadura ${armor.name}`);
      }
    }
    if (load !== "light" && slowed(race.speed) < speedBase) {
      speedBase = slowed(race.speed);
      speedNotes.push("Carga");
    }
  }
  const speedMods: LabeledModifier[] = [...pick(mods, "speed")];
  if (
    (levelsByClass.barbarian ?? 0) >= 1 &&
    armor?.kind !== "heavy" &&
    load !== "heavy" &&
    load !== "overloaded"
  ) {
    speedMods.push({ stat: "speed", value: 10, type: "untyped", label: "Movimento rápido" });
  }
  if (monkLevel > 0 && !armor && load === "light") {
    const bonus = classOf("monk").levels[monkLevel - 1]!.monk?.speedBonus ?? 0;
    if (bonus) speedMods.push({ stat: "speed", value: bonus, type: "untyped", label: "Monge" });
  }
  let speedTotal = Math.max(0, stack(speedMods, speedBase).total);
  if (flags.has("halfSpeed")) {
    speedTotal = Math.floor(speedTotal / 2 / 5) * 5;
    speedNotes.push("Metade (condição)");
  }
  if (flags.has("noMove") || load === "overloaded") speedTotal = 0;
  const runMult = armor?.kind === "heavy" || load === "heavy" ? 3 : 4;
  const run = flags.has("noRun") ? 0 : speedTotal * runMult;

  // ---- perícias
  const intMod = mod("int");
  // 1º nível: (pontos da classe + Int) ×4, mínimo 4; depois mínimo 1 por nível. Humano: +4 / +1.
  const skillPointsTotal = base.levels.reduce((sum, l, i) => {
    const per = Math.max(1, classOf(l.classId).skillPoints + intMod);
    return (
      sum + (i === 0 ? per * 4 + race.bonusSkillPoints.first : per + race.bonusSkillPoints.perLevel)
    );
  }, 0);
  const classSkillSet = new Set(classEntries.flatMap((e) => e.cls.classSkills));
  const isClassSkill = (id: string, parent?: string) =>
    classSkillSet.has(id) || (parent !== undefined && classSkillSet.has(parent));
  let skillPointsSpent = 0;
  const skills: DerivedSkill[] = srd.skills.map((s) => {
    const ranks = base.skills[s.id] ?? 0;
    const classSkill = isClassSkill(s.id, s.parent);
    skillPointsSpent += classSkill ? ranks : ranks * 2;
    const parts: LabeledModifier[] = [];
    const stat = `skill.${s.id}` as const;
    if (ranks) parts.push({ stat, value: ranks, type: "untyped", label: "Graduações" });
    if (s.ability)
      parts.push({ stat, value: mod(s.ability), type: "untyped", label: abilityLabel(s.ability) });
    if (s.armorCheck && armorCheckPenalty) {
      parts.push({
        stat,
        value: s.id === "swim" ? armorCheckPenalty * 2 : armorCheckPenalty,
        type: "untyped",
        label: "Penalidade de armadura",
      });
    }
    if (s.id === "hide" && race.size === "small")
      parts.push({ stat, value: 4, type: "size", label: "Tamanho" });
    for (const [from, to] of SYNERGIES) {
      if (to === s.id && (base.skills[from] ?? 0) >= 5) {
        const fromSkill = srd.skills.find((x) => x.id === from);
        parts.push({
          stat,
          value: 2,
          type: "untyped",
          label: `Sinergia (${fromSkill?.namePt ?? from})`,
        });
      }
    }
    parts.push(
      ...pick(mods, stat, "skill.all", ...(s.parent ? ([`skill.${s.parent}`] as const) : [])),
    );
    return {
      id: s.id,
      name: s.name,
      namePt: s.namePt,
      ability: s.ability,
      ranks,
      classSkill,
      maxRanks: classSkill ? totalLevel + 3 : (totalLevel + 3) / 2,
      trainedOnly: s.trainedOnly,
      ...(s.parent ? { parent: s.parent } : {}),
      usable: !s.trainedOnly || ranks > 0,
      total: stack(parts),
    };
  });

  // ---- talentos
  const slots = featSlots(totalLevel, levelsByClass, totalLevel > 0 ? race.bonusFeats : 0);
  const assigned = assignFeats(base.feats, slots, srd);

  // ---- magias
  const clMods = stack(pick(mods, "casterLevel")).total;
  const dcMods = stack(pick(mods, "spellDc")).total;
  const casting = classEntries
    .map((e) =>
      e.cls.casting
        ? spellcasting(e.cls, e.level, abilities[e.cls.casting.ability].score.total, {
            casterLevel: clMods,
            dc: dcMods,
          })
        : null,
    )
    .filter((x): x is Spellcasting => !!x);

  const specials = classEntries.flatMap((e) =>
    e.cls.levels.slice(0, e.level).flatMap((row) =>
      row.special.map((text, i) => ({
        classId: e.cls.id,
        level: row.level,
        text: row.specialPt?.[i] ?? text,
      })),
    ),
  );

  return {
    race,
    size: race.size,
    totalLevel,
    classLevels: classEntries.map((e) => ({
      classId: e.cls.id,
      name: e.cls.name,
      namePt: e.cls.namePt,
      level: e.level,
    })),
    abilities,
    hp,
    ac: { total: acTotal, touch, flatFooted, maxDex },
    bab,
    grapple,
    attacks,
    saves: { fort: save("fort", "con"), ref: save("ref", "dex"), will: save("will", "wis") },
    initiative: stack([
      { stat: "init", value: dex, type: "untyped", label: "Destreza" },
      ...pick(mods, "init"),
    ]),
    speed: { base: race.speed, total: speedTotal, run, notes: speedNotes },
    load: { weight, ...cap, category: load },
    armorCheckPenalty,
    arcaneSpellFailure: (armor?.spellFailure ?? 0) + (shield?.spellFailure ?? 0),
    skills,
    skillPoints: { total: skillPointsTotal, spent: skillPointsSpent },
    feats: {
      slots,
      granted: grantedFeats(levelsByClass),
      overflow: assigned.overflow,
      remaining: assigned.remaining,
    },
    spellcasting: casting,
    specials,
    flags: [...flags],
  };

  function findArmor(id: string): Armor {
    const a = srd.armor.find((x) => x.id === id);
    if (!a) throw new RulesError(`Armadura desconhecida: ${id}`);
    return a;
  }

  function weaponAttack(w: Weapon): WeaponAttack {
    const ranged = w.handedness === "ranged";
    const proficient = isWeaponProficient(w, who);
    const finesse =
      !ranged &&
      base.feats.some((f) => f.id === "weapon-finesse") &&
      (w.handedness === "light" || w.handedness === "unarmed" || FINESSE.has(w.id));
    const attackAbility: Ability = ranged || (finesse && mod("dex") > mod("str")) ? "dex" : "str";
    const featBonus = weaponFeatBonus(base.feats, w.id);
    const attackParts: LabeledModifier[] = [
      { stat: "attack", value: bab, type: "untyped", label: "BBA" },
      {
        stat: "attack",
        value: mod(attackAbility),
        type: "untyped",
        label: abilityLabel(attackAbility),
      },
      ...(sizeMod
        ? [{ stat: "attack" as const, value: sizeMod, type: "size" as const, label: "Tamanho" }]
        : []),
      ...(featBonus.attack
        ? [
            {
              stat: "attack" as const,
              value: featBonus.attack,
              type: "untyped" as const,
              label: "Foco em Arma",
            },
          ]
        : []),
      ...(!proficient
        ? [
            {
              stat: "attack" as const,
              value: -4,
              type: "untyped" as const,
              label: "Sem proficiência",
            },
          ]
        : []),
      ...(nonProficientArmorPenalty
        ? [
            {
              stat: "attack" as const,
              value: nonProficientArmorPenalty,
              type: "untyped" as const,
              label: "Armadura sem proficiência",
            },
          ]
        : []),
      ...pick(mods, "attack", ranged ? "attack.ranged" : "attack.melee"),
    ];
    const attack = stack(attackParts);
    const iterations = Math.max(1, Math.min(4, Math.ceil(bab / 5)));
    const bonuses = Array.from({ length: iterations }, (_, i) => attack.total - i * 5);

    const str = mod("str");
    let strDamage = 0;
    if (!ranged) strDamage = w.handedness === "two-handed" && str > 0 ? Math.floor(str * 1.5) : str;
    else if (STR_ON_RANGED(w)) strDamage = str;
    else if (STR_PENALTY_RANGED(w)) strDamage = Math.min(0, str);
    const monkDice =
      w.id === "unarmed-strike" && monkLevel > 0
        ? classOf("monk").levels[monkLevel - 1]!.monk?.unarmedDamage
        : undefined;
    const damage = stack([
      ...(strDamage
        ? [{ stat: "damage" as const, value: strDamage, type: "untyped" as const, label: "Força" }]
        : []),
      ...(featBonus.damage
        ? [
            {
              stat: "damage" as const,
              value: featBonus.damage,
              type: "untyped" as const,
              label: "Especialização",
            },
          ]
        : []),
      ...pick(mods, "damage", ...(ranged ? [] : (["damage.melee"] as const))),
    ]);
    const crit = `${w.critical.range < 20 ? `${w.critical.range}-20/` : ""}x${w.critical.multiplier}`;
    return {
      weaponId: w.id,
      name: w.namePt ?? w.name,
      kind: ranged ? "ranged" : "melee",
      bonuses,
      attack,
      damageDice: monkDice ?? (small ? w.damage.small : w.damage.medium) ?? "—",
      damage,
      critical: crit,
      rangeIncrement: w.rangeIncrement,
      proficient,
    };
  }
}

const LABELS: Record<Ability, string> = {
  str: "Força",
  dex: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  wis: "Sabedoria",
  cha: "Carisma",
};
function abilityLabel(a: Ability) {
  return LABELS[a];
}

export type { Part, Stat };
