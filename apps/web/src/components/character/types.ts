import type { CharacterBase, Derived, Issue } from "@mesa/rules";

export type StepProps = {
  base: CharacterBase;
  update: (fn: (draft: CharacterBase) => CharacterBase) => void;
  derived: Derived | null;
  errors: Issue[];
  warnings: Issue[];
};

export const STEPS = [
  { key: "race", label: "Raça", paths: ["name", "raceId", "alignment"] },
  { key: "abilities", label: "Atributos", paths: ["abilities"] },
  { key: "class", label: "Classe", paths: ["levels", "abilityIncreases"] },
  { key: "skills", label: "Perícias", paths: ["skills"] },
  { key: "feats", label: "Talentos", paths: ["feats"] },
  { key: "equipment", label: "Equipamento", paths: ["equipment"] },
  { key: "spells", label: "Magias", paths: ["spells", "domains"] },
  { key: "review", label: "Revisão", paths: ["hp", ""] },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

/** Em qual passo o problema aparece (pelo prefixo do caminho). */
export function stepOf(issue: Issue): StepKey {
  const head = issue.path.split(".")[0] ?? "";
  return STEPS.find((s) => (s.paths as readonly string[]).includes(head))?.key ?? "review";
}
