import corePt from "../data/pt/core.json";
import type { SrdCore } from "./types";

/**
 * Tradução para português do Brasil (gerada a partir do SRD em inglês, OGL).
 * Os campos `*Pt` ficam ao lado dos originais; o app mostra o português e cai
 * no inglês se faltar algo.
 */
type CorePt = {
  feats?: Record<
    string,
    { name: string; benefit: string; prerequisite: string | null; choice: string | null }
  >;
  weapons?: Record<string, string>;
  armor?: Record<string, string>;
  gear?: Record<string, string>;
  domains?: Record<string, { name: string; grantedPowers: string }>;
  damageTypes?: Record<string, string>;
  classSpecials?: Record<string, string>;
  proficiencies?: Record<string, string>;
  alignments?: Record<string, string>;
};

const pt = corePt as CorePt;

export function withPortuguese(srd: SrdCore): SrdCore {
  return {
    ...srd,
    feats: srd.feats.map((f) => {
      const t = pt.feats?.[f.id];
      return t
        ? {
            ...f,
            namePt: t.name,
            benefitPt: t.benefit,
            prerequisitePt: t.prerequisite,
            choicePt: t.choice,
          }
        : f;
    }),
    weapons: srd.weapons.map((w) => ({
      ...w,
      ...(pt.weapons?.[w.id] ? { namePt: pt.weapons[w.id] } : {}),
      ...(pt.damageTypes?.[w.damageType] ? { damageTypePt: pt.damageTypes[w.damageType] } : {}),
    })),
    armor: srd.armor.map((a) => (pt.armor?.[a.id] ? { ...a, namePt: pt.armor[a.id] } : a)),
    gear: srd.gear.map((g) => (pt.gear?.[g.id] ? { ...g, namePt: pt.gear[g.id] } : g)),
    domains: srd.domains.map((d) => {
      const t = pt.domains?.[d.id];
      return t ? { ...d, namePt: t.name, grantedPowersPt: t.grantedPowers } : d;
    }),
    classes: srd.classes.map((c) => ({
      ...c,
      ...(pt.proficiencies?.[c.id] ? { proficienciesPt: pt.proficiencies[c.id] } : {}),
      ...(pt.alignments?.[c.alignment] ? { alignmentPt: pt.alignments[c.alignment] } : {}),
      levels: c.levels.map((l) => ({
        ...l,
        specialPt: l.special.map((s) => pt.classSpecials?.[s] ?? s),
      })),
    })),
  };
}

/** Nome para mostrar: português quando houver. */
export const ptName = (x: { name: string; namePt?: string }) => x.namePt ?? x.name;
