/**
 * Gera `data/*.json` a partir da base SRD 3.5 do Andargor em SQLite (OGL).
 *
 *   curl -LO https://www.andargor.com/files/srd35-db-SQLite-v1.3.zip && unzip srd35-db-SQLite-v1.3.zip
 *   npm run import -w @mesa/srd -- /caminho/dnd35.db
 *
 * Só o núcleo do Livro do Jogador: 11 classes base, talentos de "SRD 3.5 Feats",
 * perícias sem psiônicos, armas/armaduras/equipamento, domínios e magias sem
 * épicas/psiônicas. Os JSON gerados vão para o repositório (build não depende da base).
 */
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type {
  Ability,
  Armor,
  ClassId,
  ClassLevelRow,
  Domain,
  Feat,
  Gear,
  Monster,
  Skill,
  Spell,
  SrdClass,
  Weapon,
} from "../src/types.ts";

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("uso: import-srd.ts <dnd35.db>");
  process.exit(1);
}
const db = new DatabaseSync(dbPath, { readOnly: true });
const outDir = new URL("../data/", import.meta.url);
const rows = (sql: string) => db.prepare(sql).all() as Record<string, string | null>[];

// ---------- utilitários ----------

const isNone = (v: string | null | undefined) => v == null || v === "None" || v === "-" || v === "";
const orNull = (v: string | null | undefined) => (isNone(v) ? null : v!.trim());
export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const int = (v: string | null | undefined) => {
  const m = /[-+]?\d+/.exec(v ?? "");
  return m ? Number(m[0]) : 0;
};
const weight = (v: string | null | undefined) => {
  if (isNone(v) || v === "special") return 0;
  const m = /(\d+)\/(\d+)|(\d+(?:\.\d+)?)/.exec(v!);
  if (!m) return 0;
  return m[1] ? Number(m[1]) / Number(m[2]) : Number(m[3]);
};
const feet = (v: string | null | undefined) => (isNone(v) ? null : int(v));
const stripHtml = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<\/p>\s*<p[^>]*>/g, "\n\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const write = (name: string, data: unknown) => {
  writeFileSync(new URL(name, outDir), `${JSON.stringify(data, null, 1)}\n`);
  console.log(`${name}: ${Array.isArray(data) ? data.length : "ok"}`);
};

// ---------- perícias ----------

const SKILL_PT: Record<string, string> = {
  appraise: "Avaliação",
  balance: "Equilíbrio",
  bluff: "Blefar",
  climb: "Escalar",
  concentration: "Concentração",
  craft: "Ofício",
  "decipher-script": "Decifrar Escrita",
  diplomacy: "Diplomacia",
  "disable-device": "Operar Mecanismo",
  disguise: "Disfarces",
  "escape-artist": "Arte da Fuga",
  forgery: "Falsificação",
  "gather-information": "Obter Informação",
  "handle-animal": "Adestrar Animais",
  heal: "Cura",
  hide: "Esconder-se",
  intimidate: "Intimidação",
  jump: "Saltar",
  knowledge: "Conhecimento",
  listen: "Ouvir",
  "move-silently": "Furtividade",
  "open-lock": "Abrir Fechaduras",
  perform: "Atuação",
  profession: "Profissão",
  ride: "Cavalgar",
  search: "Procurar",
  "sense-motive": "Sentir Motivação",
  "sleight-of-hand": "Prestidigitação",
  spellcraft: "Identificar Magia",
  spot: "Observar",
  survival: "Sobrevivência",
  swim: "Natação",
  tumble: "Acrobacia",
  "use-magic-device": "Usar Instrumento Mágico",
  "use-rope": "Usar Cordas",
};
const SUB_PT: Record<string, string> = {
  arcana: "arcano",
  "architecture-and-engineering": "arquitetura e engenharia",
  dungeoneering: "masmorras",
  geography: "geografia",
  history: "história",
  local: "local",
  nature: "natureza",
  "nobility-and-royalty": "nobreza e realeza",
  religion: "religião",
  "the-planes": "planos",
  alchemy: "alquimia",
  armorsmithing: "armaduras",
  weaponsmithing: "armas",
  blacksmithing: "ferraria",
  bowmaking: "arcos",
  carpentry: "carpintaria",
  tailoring: "alfaiataria",
  bookkeeper: "contador",
  hunter: "caçador",
  miner: "minerador",
  "siege-engineer": "engenheiro de cerco",
  apothecary: "boticário",
  boater: "barqueiro",
  cook: "cozinheiro",
  farmer: "fazendeiro",
  fisherman: "pescador",
  guide: "guia",
  herbalist: "herbalista",
  innkeeper: "estalajadeiro",
  sailor: "marinheiro",
  scribe: "escriba",
  stablehand: "cavalariço",
  tanner: "curtidor",
  teamster: "carroceiro",
  woodcutter: "lenhador",
  trapmaking: "armadilhas",
  leatherworking: "couro",
  stonemasonry: "cantaria",
  act: "atuar",
  comedy: "comédia",
  dance: "dança",
  "keyboard-instruments": "instrumentos de teclado",
  oratory: "oratória",
  "percussion-instruments": "percussão",
  sing: "canto",
  "string-instruments": "instrumentos de corda",
  "wind-instruments": "instrumentos de sopro",
};
// Subtipos que a base lista e não são do Livro do Jogador.
const SKIP_SUB = new Set(["psionics", "dreamweaving"]);
const PSIONIC_SKILLS = new Set([
  "autohypnosis",
  "psicraft",
  "use-psionic-device",
  "speak-language",
]);

const skills: Skill[] = [];
for (const r of rows("select * from skill order by name")) {
  const id = slug(r.name!);
  if (PSIONIC_SKILLS.has(id) || skills.some((s) => s.id === id || s.parent === id)) continue;
  const base = {
    ability: (r.key_ability === "None" ? null : r.key_ability!.toLowerCase()) as Ability | null,
    trainedOnly: r.trained === "Yes",
    armorCheck: r.armor_check === "Yes",
  };
  if (isNone(r.subtype)) {
    skills.push({ id, name: r.name!, namePt: SKILL_PT[id] ?? r.name!, ...base });
    continue;
  }
  const subs = r.subtype!.split(",").map((s) => s.trim());
  // A base traz poucos exemplos; completa com os do Livro do Jogador.
  if (id === "craft") subs.push("bowmaking", "carpentry", "tailoring");
  if (id === "profession") {
    subs.push("apothecary", "boater", "cook", "farmer", "fisherman", "guide", "herbalist");
    subs.push("innkeeper", "sailor", "scribe", "stablehand", "tanner", "teamster", "woodcutter");
  }
  for (const sub of subs) {
    const subId = slug(sub);
    if (SKIP_SUB.has(subId)) continue;
    skills.push({
      id: `${id}.${subId}`,
      name: `${r.name} (${sub})`,
      namePt: `${SKILL_PT[id] ?? r.name} (${SUB_PT[subId] ?? sub})`,
      parent: id,
      ...base,
    });
  }
}

// ---------- classes ----------

const CLASS_PT: Record<ClassId, string> = {
  barbarian: "Bárbaro",
  bard: "Bardo",
  cleric: "Clérigo",
  druid: "Druida",
  fighter: "Guerreiro",
  monk: "Monge",
  paladin: "Paladino",
  ranger: "Patrulheiro",
  rogue: "Ladino",
  sorcerer: "Feiticeiro",
  wizard: "Mago",
};
const CASTING: Partial<Record<ClassId, SrdClass["casting"]>> = {
  bard: { ability: "cha", kind: "arcane", style: "spontaneous", list: "Bard" },
  cleric: { ability: "wis", kind: "divine", style: "prepared", list: "Cleric" },
  druid: { ability: "wis", kind: "divine", style: "prepared", list: "Druid" },
  paladin: {
    ability: "cha",
    kind: "divine",
    style: "prepared",
    list: "Paladin",
    halfCasterLevel: true,
  },
  ranger: {
    ability: "wis",
    kind: "divine",
    style: "prepared",
    list: "Ranger",
    halfCasterLevel: true,
  },
  sorcerer: { ability: "cha", kind: "arcane", style: "spontaneous", list: "Sorcerer/Wizard" },
  wizard: { ability: "int", kind: "arcane", style: "prepared", list: "Sorcerer/Wizard" },
};

function parseClassSkills(raw: string): string[] {
  const text = raw.replace(/Knowledge \(all skills, taken individually\)/g, "Knowledge (*)");
  const out: string[] = [];
  for (const part of text.split(",").map((s) => s.trim())) {
    const m = /^(.+?)(?: \((.+)\))?$/.exec(part)!;
    const id = slug(m[1]!);
    if (PSIONIC_SKILLS.has(id)) continue;
    if (!skills.some((s) => s.id === id || s.parent === id))
      throw new Error(`perícia desconhecida: ${part}`);
    out.push(!m[2] || m[2] === "*" ? id : `${id}.${slug(m[2])}`);
  }
  return out;
}

function parseSlots(r: Record<string, string | null>, prefix: string) {
  let any = false;
  const slots: (number | null)[] = [];
  const domain: number[] = [];
  for (let i = 0; i <= 9; i++) {
    const v = r[`${prefix}${i}`];
    if (isNone(v)) {
      slots.push(null);
      domain.push(0);
      continue;
    }
    any = true;
    const [n, extra] = v!.split("+");
    slots.push(Number(n));
    domain.push(extra ? Number(extra) : 0);
  }
  return any
    ? { slots, domain: domain.some(Boolean) ? domain : null }
    : { slots: null, domain: null };
}

const classes: SrdClass[] = rows("select * from class where type = 'base' order by name").map(
  (c) => {
    const id = slug(c.name!) as ClassId;
    const levels: ClassLevelRow[] = rows(
      `select * from class_table where name = '${c.name}' and cast(level as integer) <= 20 order by cast(level as integer)`,
    ).map((r) => {
      const s = parseSlots(r, "slots_");
      const k = parseSlots(r, "spells_known_");
      return {
        level: Number(r.level),
        bab: int(r.base_attack_bonus),
        fort: int(r.fort_save),
        ref: int(r.ref_save),
        will: int(r.will_save),
        special: isNone(r.special)
          ? []
          : r
              .special!.split(/,\s*|\n/)
              .map((x) => x.trim())
              .filter(Boolean),
        slots: s.slots,
        domainSlots: s.domain,
        known: k.slots,
        ...(id === "monk"
          ? {
              monk: {
                acBonus: int(r.ac_bonus),
                speedBonus: int(r.unarmored_speed_bonus),
                unarmedDamage: r.unarmed_damage!,
                flurry: r.flurry_of_blows!,
              },
            }
          : {}),
      };
    });
    if (levels.length !== 20) throw new Error(`${c.name}: ${levels.length} níveis`);
    return {
      id,
      name: c.name!,
      namePt: CLASS_PT[id],
      hitDie: int(c.hit_die),
      skillPoints: int(c.skill_points),
      classSkills: parseClassSkills(c.class_skills!),
      alignment: c.alignment!,
      casting: CASTING[id] ?? null,
      proficiencies: stripHtml(c.proficiencies),
      levels,
    };
  },
);
if (classes.length !== 11) throw new Error(`esperava 11 classes, veio ${classes.length}`);

// ---------- talentos ----------

const feats: Feat[] = rows("select * from feat where reference = 'SRD 3.5 Feats' order by name")
  .filter((f) => !/Psionic|Metapsionic|Type of Feat/.test(f.type!))
  .map((f) => ({
    id: slug(f.name!),
    name: f.name!,
    // A base não marca os talentos de guerreiro no tipo; o texto diz "fighter bonus feats".
    types: [
      ...f.type!.split(",").map((t) => t.trim()),
      ...(/fighter bonus feat/i.test(`${f.special} ${f.full_text}`) ? ["Fighter"] : []),
    ],
    multiple: f.multiple === "Yes",
    stack: f.stack === "Yes",
    choice: orNull(f.choice),
    prerequisite: orNull(f.prerequisite)?.replace(/\.$/, "") ?? null,
    benefit: stripHtml(f.benefit).replace(/^Benefit:\s*/m, ""),
  }));

// ---------- equipamento ----------

const PROF = {
  "Simple Weapons": "simple",
  "Martial Weapons": "martial",
  "Exotic Weapons": "exotic",
} as const;
const HAND = {
  "Unarmed Attacks": "unarmed",
  "Light Melee Weapons": "light",
  "One-Handed Melee Weapons": "one-handed",
  "Two-Handed Melee Weapons": "two-handed",
  "Ranged Weapons": "ranged",
} as const;
// Linhas com colunas deslocadas na base; corrigidas pelo Livro do Jogador.
const WEAPON_FIX: Record<string, Partial<Weapon>> = {
  whip: {
    critical: { range: 20, multiplier: 2 },
    rangeIncrement: null,
    weight: 2,
    damageType: "Slashing",
  },
  net: { critical: { range: 20, multiplier: 1 }, rangeIncrement: 10, weight: 6, damageType: "-" },
};
// Ataques com escudo/armadura espinhosa dependem do item de armadura.
const WEAPON_SKIP = new Set([
  "shield-light",
  "shield-heavy",
  "spiked-shield-light",
  "spiked-shield-heavy",
  "spiked-armor",
]);

function critical(raw: string | null | undefined) {
  if (isNone(raw)) return { range: 20, multiplier: 2 };
  const m = /(?:(\d+)-20\/)?[x×](\d)/.exec(raw!);
  return { range: m?.[1] ? Number(m[1]) : 20, multiplier: m ? Number(m[2]) : 2 };
}

const weapons: Weapon[] = [];
const gear: Gear[] = [];
for (const e of rows("select * from equipment where family = 'Weapons' order by name")) {
  const id = slug(e.name!);
  if (e.subcategory === "Ammunition") {
    gear.push({ id, name: e.name!, cost: e.cost!, weight: weight(e.weight) });
    continue;
  }
  if (WEAPON_SKIP.has(id)) continue;
  weapons.push({
    id,
    name: e.name!,
    proficiency: PROF[e.category as keyof typeof PROF],
    handedness: HAND[e.subcategory as keyof typeof HAND],
    cost: isNone(e.cost) ? "-" : e.cost!,
    damage: { small: orNull(e.dmg_s), medium: orNull(e.dmg_m) },
    critical: critical(e.critical),
    rangeIncrement: feet(e.range_increment),
    weight: weight(e.weight),
    damageType: orNull(e.type) ?? "-",
    ...WEAPON_FIX[id],
  });
}

const ARMOR_KIND = {
  "Light armor": "light",
  "Medium armor": "medium",
  "Heavy armor": "heavy",
  Shields: "shield",
} as const;
const armor: Armor[] = [];
for (const e of rows("select * from equipment where family = 'Armor and Shields' order by name")) {
  const kind = ARMOR_KIND[e.subcategory as keyof typeof ARMOR_KIND];
  if (!kind) {
    gear.push({ id: slug(e.name!), name: e.name!, cost: e.cost!, weight: weight(e.weight) });
    continue;
  }
  armor.push({
    id: slug(e.name!),
    name: e.name!,
    kind,
    cost: e.cost!,
    bonus: int(e.armor_shield_bonus),
    maxDex: isNone(e.maximum_dex_bonus) ? null : int(e.maximum_dex_bonus),
    checkPenalty: isNone(e.armor_check_penalty) ? 0 : int(e.armor_check_penalty),
    spellFailure: isNone(e.arcane_spell_failure_chance) ? 0 : int(e.arcane_spell_failure_chance),
    speed30: feet(e.speed_30),
    speed20: feet(e.speed_20),
    weight: weight(e.weight),
  });
}
for (const e of rows(
  "select * from equipment where family = 'Goods and Services' and category = 'Item' order by name",
)) {
  const id = slug(e.name!);
  if (gear.some((g) => g.id === id)) continue;
  gear.push({ id, name: e.name!, cost: isNone(e.cost) ? "-" : e.cost!, weight: weight(e.weight) });
}

// ---------- magias ----------

// Domínios extras repetem magias do núcleo (Rage, Undeath to Death): junta as listas.
const spellsById = new Map<string, Spell>();
for (const s of rows(
  "select * from spell where reference not like '%Epic%' and reference not like '%Psionic%' order by name, reference desc",
).map((s) => {
  const levels: Record<string, number> = {};
  for (const part of (s.level ?? "").split(",")) {
    const m = /^(.+?)\s+(\d)$/.exec(part.trim());
    if (m) levels[m[1]!] = Number(m[2]);
  }
  return {
    id: slug(s.name!),
    name: s.name!,
    school: s.school!,
    subschool: orNull(s.subschool),
    descriptor: orNull(s.descriptor),
    levels,
    components: s.components ?? "",
    castingTime: s.casting_time ?? "",
    range: s.range ?? "",
    target: orNull(s.target),
    area: orNull(s.area),
    effect: orNull(s.effect),
    duration: s.duration ?? "",
    savingThrow: orNull(s.saving_throw),
    spellResistance: orNull(s.spell_resistance),
    summary: s.short_description ?? "",
    description: stripHtml(s.description),
  };
})) {
  const prev = spellsById.get(s.id);
  if (prev) Object.assign(prev.levels, s.levels);
  else spellsById.set(s.id, s);
}
const spells = [...spellsById.values()];

// ---------- domínios ----------

/** "mass heal" → "Heal, Mass"; tira observações entre parênteses. */
function spellIdFromDomain(raw: string): string | null {
  const name = raw.replace(/\s*\(.*\)\s*$/, "").trim();
  const m = /^(mass|greater|lesser)\s+(.+)$/i.exec(name);
  const alias: Record<string, string> = { blindness: "Blindness/Deafness" };
  const candidates = [alias[name] ?? name, m ? `${m[2]}, ${m[1]}` : ""].filter(Boolean).map(slug);
  return candidates.find((id) => spellsById.has(id)) ?? null;
}

const domains: Domain[] = rows(
  "select * from domain where reference not like '%Psionic%' order by name",
).map((d) => ({
  id: slug(d.name!),
  name: d.name!,
  grantedPowers: stripHtml(d.granted_powers),
  spells: Array.from({ length: 9 }, (_, i) => (d[`spell_${i + 1}`] ?? "").trim()).map((name) => ({
    name,
    id: spellIdFromDomain(name),
  })),
}));

// ---------- monstros ----------

const num = (re: RegExp, text: string | null | undefined, fallback = 0) => {
  const m = re.exec(text ?? "");
  return m ? Number(m[1]!.replace("+", "")) : fallback;
};
const SIZE_SQUARES: Record<string, number> = { "5 ft.": 1, "10 ft.": 2, "15 ft.": 3, "20 ft.": 4 };

/** "Morningstar +2 melee (1d6) or javelin +3 ranged (1d4)" → ataques da ficha de NPC. */
function parseAttacks(text: string | null): Monster["attacks"] {
  if (isNone(text)) return [];
  const out: Monster["attacks"] = [];
  for (const part of text!.split(/\s+(?:or|and)\s+|,\s+(?=\d*\s*[a-z]+ [+-])/i)) {
    // "corpo a corpo/à distância" pode faltar ou vir depois do dano ("Bite +25 (2d6+6) melee").
    const m =
      /^(?:\d+\s+)?(.+?)\s+([+-]\d+)(?:\/[+-]\d+)*(?:\s+(?:melee|ranged)(?:\s+touch)?)?\s*\((.+?)\)/i.exec(
        part.trim(),
      );
    if (!m) continue;
    const inner = m[3]!;
    const dice = /^(\d+d\d+(?:[+-]\d+)?)/.exec(inner.trim());
    if (!dice) continue;
    const range = /\/(\d{2})-20/.exec(inner)?.[1];
    const mult = /[x×](\d)/.exec(inner)?.[1];
    const name = m[1]!.replace(/^\w/, (c) => c.toUpperCase());
    out.push({
      name,
      bonus: Number(m[2]),
      damage: dice[1]!,
      critical: `${range ? `${range}-20/` : ""}x${mult ?? 2}`,
    });
    if (out.length >= 10) break;
  }
  return out;
}

const monsters: Monster[] = [];
const seenMonsters = new Set<string>();
for (const r of rows(
  "select * from monster where reference not like '%Epic%' and reference not like '%Psionic%' order by name",
)) {
  const id = slug(r.name!);
  if (seenMonsters.has(id)) continue;
  // Sem "attack", o "full attack" traz as mesmas armas (com quantidade na frente).
  const attacks = parseAttacks(isNone(r.attack) ? (r.full_attack ?? null) : r.attack!);
  const hp = num(/\((\d+) hp\)/, r.hit_dice);
  const ac = num(/^(-?\d+)/, r.armor_class, -1);
  if (!hp || ac < 0) continue;
  seenMonsters.add(id);
  monsters.push({
    id,
    name: r.name!,
    type: r.type ?? "",
    size: r.size ?? "Medium",
    cr: orNull(r.challenge_rating) ?? "—",
    squares: SIZE_SQUARES[r.space ?? ""] ?? (/Huge|Gargantuan|Colossal/.test(r.size ?? "") ? 4 : 1),
    hp,
    hitDice: (r.hit_dice ?? "").replace(/\s*\(.*\)/, ""),
    ac,
    touch: num(/touch (-?\d+)/, r.armor_class, ac),
    flatFooted: num(/flat-footed (-?\d+)/, r.armor_class, ac),
    init: num(/^([+-]?\d+)/, r.initiative),
    speed: num(/^(\d+) ft/, r.speed, 30),
    fort: num(/Fort ([+-]\d+)/, r.saves),
    ref: num(/Ref ([+-]\d+)/, r.saves),
    will: num(/Will ([+-]\d+)/, r.saves),
    attacks,
    fullAttack: orNull(r.full_attack) ?? "",
    specialAttacks: orNull(r.special_attacks),
    specialQualities: orNull(r.special_qualities),
  });
}

// Ids únicos (a base tem alguns nomes repetidos).
for (const [name, list] of Object.entries({ skills, feats, weapons, armor, gear, spells })) {
  const seen = new Set<string>();
  for (const item of list as { id: string }[]) {
    if (seen.has(item.id)) throw new Error(`${name}: id repetido ${item.id}`);
    seen.add(item.id);
  }
}

write("classes.json", classes);
write("skills.json", skills);
write("feats.json", feats);
write("weapons.json", weapons);
write("armor.json", armor);
write("gear.json", gear);
write("domains.json", domains);
write("spells.json", spells);
write("monsters.json", monsters);
