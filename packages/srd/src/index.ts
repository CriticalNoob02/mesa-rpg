import armor from "../data/armor.json";
import classes from "../data/classes.json";
import domains from "../data/domains.json";
import feats from "../data/feats.json";
import gear from "../data/gear.json";
import skills from "../data/skills.json";
import weapons from "../data/weapons.json";
import { CONDITIONS } from "./conditions";
import { withPortuguese } from "./i18n";
import { RACES } from "./races";
import type { Armor, Domain, Feat, Gear, Skill, SrdClass, SrdCore, Weapon } from "./types";

export { BUFFS, type BuffPreset } from "./buffs";
export { ptName } from "./i18n";
export * from "./types";
export { CONDITIONS, RACES };

/**
 * Núcleo do SRD (pequeno, usado por web e server). As magias ficam em
 * `@mesa/srd/spells` porque pesam ~800 KB: o web carrega sob demanda.
 */
export const SRD: SrdCore = withPortuguese({
  races: RACES,
  classes: classes as SrdClass[],
  skills: skills as Skill[],
  feats: feats as Feat[],
  weapons: weapons as Weapon[],
  armor: armor as Armor[],
  gear: gear as Gear[],
  domains: domains as Domain[],
  conditions: CONDITIONS,
});
