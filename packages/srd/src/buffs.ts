import type { Modifier } from "./types";

export type BuffPreset = { key: string; namePt: string; summaryPt: string; modifiers: Modifier[] };

const m = (stat: Modifier["stat"], value: number, type: Modifier["type"]): Modifier => ({
  stat,
  value,
  type,
});

/**
 * Magias de buff comuns do Livro do Jogador como efeitos prontos (valores do
 * nível baixo; o mestre ajusta no efeito personalizado se precisar).
 */
export const BUFFS: BuffPreset[] = [
  {
    key: "bless",
    namePt: "Bênção",
    summaryPt: "+1 de moral no ataque.",
    modifiers: [m("attack", 1, "morale")],
  },
  {
    key: "bane",
    namePt: "Perdição",
    summaryPt: "−1 no ataque.",
    modifiers: [m("attack", -1, "morale")],
  },
  {
    key: "prayer",
    namePt: "Oração",
    summaryPt: "+1 de sorte em ataque, dano, resistências e perícias.",
    modifiers: [
      m("attack", 1, "luck"),
      m("damage", 1, "luck"),
      m("save.all", 1, "luck"),
      m("skill.all", 1, "luck"),
    ],
  },
  {
    key: "heroism",
    namePt: "Heroísmo",
    summaryPt: "+2 de moral em ataque, resistências e perícias.",
    modifiers: [m("attack", 2, "morale"), m("save.all", 2, "morale"), m("skill.all", 2, "morale")],
  },
  {
    key: "haste",
    namePt: "Velocidade",
    summaryPt: "+1 no ataque, +1 de esquiva na CA e Reflexos, +9 m de deslocamento.",
    modifiers: [
      m("attack", 1, "untyped"),
      m("ac", 1, "dodge"),
      m("save.ref", 1, "dodge"),
      m("speed", 30, "enhancement"),
    ],
  },
  {
    key: "mage-armor",
    namePt: "Armadura Arcana",
    summaryPt: "+4 de armadura na CA.",
    modifiers: [m("ac", 4, "armor")],
  },
  {
    key: "shield",
    namePt: "Escudo Arcano",
    summaryPt: "+4 de escudo na CA.",
    modifiers: [m("ac", 4, "shield")],
  },
  {
    key: "shield-of-faith",
    namePt: "Escudo da Fé",
    summaryPt: "+2 de deflexão na CA.",
    modifiers: [m("ac", 2, "deflection")],
  },
  {
    key: "barkskin",
    namePt: "Pele de Árvore",
    summaryPt: "+2 de armadura natural.",
    modifiers: [m("ac", 2, "natural")],
  },
  {
    key: "protection-from-evil",
    namePt: "Proteção contra o Mal",
    summaryPt: "+2 de deflexão na CA e +2 de resistência nas resistências (contra o mal).",
    modifiers: [m("ac", 2, "deflection"), m("save.all", 2, "resistance")],
  },
  {
    key: "resistance",
    namePt: "Resistência",
    summaryPt: "+1 de resistência nas resistências.",
    modifiers: [m("save.all", 1, "resistance")],
  },
  {
    key: "bulls-strength",
    namePt: "Força do Touro",
    summaryPt: "+4 de melhoria em Força.",
    modifiers: [m("str", 4, "enhancement")],
  },
  {
    key: "cats-grace",
    namePt: "Graça Felina",
    summaryPt: "+4 de melhoria em Destreza.",
    modifiers: [m("dex", 4, "enhancement")],
  },
  {
    key: "bears-endurance",
    namePt: "Vigor do Urso",
    summaryPt: "+4 de melhoria em Constituição.",
    modifiers: [m("con", 4, "enhancement")],
  },
  {
    key: "foxs-cunning",
    namePt: "Astúcia da Raposa",
    summaryPt: "+4 de melhoria em Inteligência.",
    modifiers: [m("int", 4, "enhancement")],
  },
  {
    key: "owls-wisdom",
    namePt: "Sabedoria da Coruja",
    summaryPt: "+4 de melhoria em Sabedoria.",
    modifiers: [m("wis", 4, "enhancement")],
  },
  {
    key: "eagles-splendor",
    namePt: "Esplendor da Águia",
    summaryPt: "+4 de melhoria em Carisma.",
    modifiers: [m("cha", 4, "enhancement")],
  },
  {
    key: "guidance",
    namePt: "Orientação",
    summaryPt: "+1 de competência num teste (ataque, resistência ou perícia).",
    modifiers: [
      m("attack", 1, "competence"),
      m("save.all", 1, "competence"),
      m("skill.all", 1, "competence"),
    ],
  },
];
