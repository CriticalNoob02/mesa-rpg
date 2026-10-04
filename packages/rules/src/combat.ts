import type { Modifier } from "@mesa/srd";
import { type DieRng, type RollResult, rollExpr } from "./dice";
import { type LabeledModifier, pick, stack } from "./stacking";

export type AttackInput = {
  /** Bônus total do ataque (já com efeitos e modificadores da situação). */
  bonus: number;
  targetAc: number;
  /** Ameaça a partir deste natural (20, 19, 18…). */
  critRange: number;
  critMultiplier: number;
  /** Expressão de dano de um golpe, ex. "1d8+3". */
  damage: string;
};

export type AttackResult = {
  attack: RollResult;
  natural: number;
  total: number;
  hit: boolean;
  threat: boolean;
  confirm: { roll: RollResult; natural: number; total: number; confirmed: boolean } | null;
  critical: boolean;
  /** Rolagens de dano (uma por multiplicador no crítico). */
  damageRolls: RollResult[];
  damage: number;
};

const d20 = (bonus: number) => (bonus === 0 ? "1d20" : `1d20${bonus > 0 ? "+" : ""}${bonus}`);
const naturalOf = (r: RollResult) => (r.terms[0]?.kind === "dice" ? r.terms[0].rolls[0]! : 0);

/**
 * Ataque do 3.5: 1 natural sempre erra, 20 natural sempre acerta. Acerto com
 * natural na margem de ameaça pede confirmação (novo ataque contra a mesma CA);
 * confirmado, o dano é rolado `critMultiplier` vezes. Dano mínimo 1.
 */
export function resolveAttack(input: AttackInput, rng: DieRng): AttackResult {
  const attack = rollExpr(d20(input.bonus), rng);
  const natural = naturalOf(attack);
  const total = attack.total;
  const hit = natural === 20 || (natural !== 1 && total >= input.targetAc);
  const threat = hit && natural >= input.critRange;
  let confirm: AttackResult["confirm"] = null;
  if (threat) {
    const roll = rollExpr(d20(input.bonus), rng);
    const n = naturalOf(roll);
    confirm = {
      roll,
      natural: n,
      total: roll.total,
      confirmed: n === 20 || (n !== 1 && roll.total >= input.targetAc),
    };
  }
  const critical = !!confirm?.confirmed;
  const damageRolls = hit
    ? Array.from({ length: critical ? input.critMultiplier : 1 }, () => rollExpr(input.damage, rng))
    : [];
  const damage = hit
    ? Math.max(
        1,
        damageRolls.reduce((s, r) => s + r.total, 0),
      )
    : 0;
  return { attack, natural, total, hit, threat, confirm, critical, damageRolls, damage };
}

/** Expressão de dano a partir do dado da arma e do bônus fixo. */
export function damageExpr(dice: string, bonus: number) {
  return bonus === 0 ? dice : `${dice}${bonus > 0 ? "+" : ""}${bonus}`;
}

/** Converte "19-20/x2" no par (margem, multiplicador). */
export function parseCritical(text: string): { range: number; multiplier: number } {
  const m = /^(?:(\d+)-20\/)?x(\d)$/.exec(text.trim());
  return { range: m?.[1] ? Number(m[1]) : 20, multiplier: m ? Number(m[2]) : 2 };
}

export type InitiativeEntry = { id: string; bonus: number; roll: number };

/** Ordem do combate: maior total; empate, maior bônus; depois a ordem dada (desempate já sorteado). */
export function sortInitiative<T extends InitiativeEntry>(entries: T[]): (T & { total: number })[] {
  return entries
    .map((e, i) => ({ ...e, total: e.roll + e.bonus, i }))
    .sort((a, b) => b.total - a.total || b.bonus - a.bonus || a.i - b.i)
    .map(({ i: _, ...e }) => e as T & { total: number });
}

/** Bloco simples de NPC/monstro (o mestre digita). */
export type NpcStats = {
  hp: number;
  hpMax: number;
  ac: number;
  touch: number;
  flatFooted: number;
  init: number;
  fort: number;
  ref: number;
  will: number;
  attacks: { name: string; bonus: number; damage: string; critical: string }[];
};

export const emptyNpcStats = (): NpcStats => ({
  hp: 6,
  hpMax: 6,
  ac: 12,
  touch: 11,
  flatFooted: 11,
  init: 0,
  fort: 0,
  ref: 0,
  will: 0,
  attacks: [],
});

/**
 * Números do NPC com efeitos ativos. Os valores digitados já trazem armadura,
 * Destreza etc.; os efeitos entram somados com a regra de empilhamento entre si.
 */
export function deriveNpc(
  stats: NpcStats,
  effects: { sourceName: string; modifiers: Modifier[] }[],
) {
  const mods: LabeledModifier[] = effects.flatMap((e) =>
    e.modifiers.map((m) => ({ ...m, label: e.sourceName })),
  );
  const add = (...keys: Parameters<typeof pick>[1][]) => stack(pick(mods, ...keys)).total;
  const acBonus = add("ac");
  const dodge = stack(pick(mods, "ac").filter((m) => m.type === "dodge")).total;
  const touchBonus = stack(
    pick(mods, "ac").filter((m) => !["armor", "shield", "natural"].includes(m.type)),
  ).total;
  return {
    hp: stats.hp,
    hpMax: stats.hpMax + add("hpMax"),
    ac: stats.ac + acBonus,
    touch: stats.touch + touchBonus,
    flatFooted: stats.flatFooted + acBonus - dodge,
    init: stats.init + add("init"),
    fort: stats.fort + add("save.fort", "save.all"),
    ref: stats.ref + add("save.ref", "save.all"),
    will: stats.will + add("save.will", "save.all"),
    speedBonus: add("speed"),
    attacks: stats.attacks.map((a) => ({
      ...a,
      bonus: a.bonus + add("attack", "attack.melee"),
      damageBonus: add("damage"),
    })),
  };
}

/** Estado pelos PV (3.5): incapacitado em 0, morrendo de −1 a −9, morto em −10. */
export function hpState(hp: number): "ok" | "disabled" | "dying" | "dead" {
  if (hp <= -10) return "dead";
  if (hp < 0) return "dying";
  if (hp === 0) return "disabled";
  return "ok";
}
