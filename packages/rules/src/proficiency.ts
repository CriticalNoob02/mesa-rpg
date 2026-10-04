import type { Armor, ClassId, Weapon } from "@mesa/srd";

type ArmorProf = "light" | "medium" | "heavy" | "shield" | "tower";

const CLASS_ARMOR: Record<ClassId, ArmorProf[]> = {
  barbarian: ["light", "medium", "shield"],
  bard: ["light", "shield"],
  cleric: ["light", "medium", "heavy", "shield"],
  druid: ["light", "medium", "shield"],
  fighter: ["light", "medium", "heavy", "shield", "tower"],
  monk: [],
  paladin: ["light", "medium", "heavy", "shield"],
  ranger: ["light", "shield"],
  rogue: ["light"],
  sorcerer: [],
  wizard: [],
};

/** "all-simple", "all-martial" ou ids de arma. */
const CLASS_WEAPONS: Record<ClassId, string[]> = {
  barbarian: ["all-simple", "all-martial"],
  bard: ["all-simple", "longsword", "rapier", "sap", "sword-short", "shortbow"],
  cleric: ["all-simple"],
  druid: [
    "club",
    "dagger",
    "dart",
    "quarterstaff",
    "scimitar",
    "sickle",
    "shortspear",
    "sling",
    "spear",
  ],
  fighter: ["all-simple", "all-martial"],
  monk: [
    "club",
    "crossbow-light",
    "crossbow-heavy",
    "dagger",
    "handaxe",
    "javelin",
    "kama",
    "nunchaku",
    "quarterstaff",
    "sai",
    "siangham",
    "sling",
  ],
  paladin: ["all-simple", "all-martial"],
  ranger: ["all-simple", "all-martial"],
  rogue: ["all-simple", "crossbow-hand", "rapier", "sap", "shortbow", "sword-short"],
  sorcerer: ["all-simple"],
  wizard: ["club", "dagger", "crossbow-heavy", "crossbow-light", "quarterstaff"],
};

/** Proficiência racial direta (elfo). */
const RACE_WEAPONS: Record<string, string[]> = {
  elf: ["longsword", "rapier", "longbow", "longbow-composite", "shortbow", "shortbow-composite"],
};

/** Familiaridade: armas exóticas tratadas como comuns pela raça (anão, gnomo). */
const RACE_FAMILIAR: Record<string, string[]> = {
  dwarf: ["waraxe-dwarven", "urgrosh-dwarven"],
  gnome: ["hammer-gnome-hooked"],
};

const ARMOR_FEATS: Record<string, ArmorProf> = {
  "armor-proficiency-light": "light",
  "armor-proficiency-medium": "medium",
  "armor-proficiency-heavy": "heavy",
  "shield-proficiency": "shield",
  "tower-shield-proficiency": "tower",
};

type Who = { classIds: ClassId[]; raceId: string; feats: { id: string; choice?: string }[] };

export function isArmorProficient(armor: Armor, who: Who): boolean {
  const need: ArmorProf =
    armor.kind === "shield" ? (armor.id.includes("tower") ? "tower" : "shield") : armor.kind;
  const have = new Set<ArmorProf>(who.classIds.flatMap((c) => CLASS_ARMOR[c]));
  for (const f of who.feats) if (ARMOR_FEATS[f.id]) have.add(ARMOR_FEATS[f.id]!);
  return have.has(need);
}

export function isWeaponProficient(weapon: Weapon, who: Who): boolean {
  if (weapon.handedness === "unarmed") return true;
  const have = new Set<string>([
    ...who.classIds.flatMap((c) => CLASS_WEAPONS[c]),
    ...(RACE_WEAPONS[who.raceId] ?? []),
  ]);
  for (const f of who.feats) {
    if (f.id === "simple-weapon-proficiency") have.add("all-simple");
    if (
      (f.id === "martial-weapon-proficiency" || f.id === "exotic-weapon-proficiency") &&
      f.choice
    ) {
      have.add(f.choice);
    }
  }
  if (have.has(weapon.id)) return true;
  const familiar = RACE_FAMILIAR[who.raceId]?.includes(weapon.id);
  if (weapon.proficiency === "simple") return have.has("all-simple");
  if (weapon.proficiency === "martial" || familiar) return have.has("all-martial");
  return false;
}
