import type { HpMode } from "@mesa/protocol";
import type { CharacterBase, Derived, Issue } from "@mesa/rules";

/** O que quem edita pode mudar (o servidor confere de novo). */
export type StepLimits = {
  /** Raça e atributos travados: ficha que já existe, editada por jogador. */
  locked: boolean;
  /** Níveis já ganhos: não saem nem mudam de classe. */
  fixedLevels: number;
  /** Níveis que a ficha salva já tem (os seguintes ganham PV no servidor). */
  savedLevels: number;
  /** Até quantos níveis: nível inicial da campanha ou o que o XP permite. */
  maxLevels: number;
  /** PV dos níveis novos saem do servidor (média ou dado), não do formulário. */
  hpMode: HpMode;
  /** A rolagem de atributos desta pessoa (uma só). */
  abilityRoll: number[] | null;
};

export const FREE_LIMITS: StepLimits = {
  locked: false,
  fixedLevels: 0,
  savedLevels: 20,
  maxLevels: 20,
  hpMode: "average",
  abilityRoll: null,
};

export type StepProps = {
  base: CharacterBase;
  update: (fn: (draft: CharacterBase) => CharacterBase) => void;
  derived: Derived | null;
  errors: Issue[];
  warnings: Issue[];
  limits?: StepLimits;
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
