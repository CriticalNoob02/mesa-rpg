import {
  type ActiveEffect,
  DICE_LIMITS,
  type DieRng,
  damageExpr,
  deriveCharacter,
  deriveNpc,
  moveBudgets,
  type NpcStats,
  parseCritical,
  parseExpr,
  resolveAttack,
  rollExpr,
  sortInitiative,
} from "@mesa/rules";
import { BONUS_TYPES, type Modifier, SRD } from "@mesa/srd";
import { z } from "zod";
import { singleLine } from "../lib/text";
import type { CombatRecord, EffectRecord, PlayerRecord, Store, TokenRecord } from "../store/types";
import { ActionError } from "./action";
import type { Hub } from "./hub";

const id = z.string().min(1).max(40);
const statKey = z
  .string()
  .regex(
    /^(str|dex|con|int|wis|cha|ac|attack(\.melee|\.ranged)?|damage(\.melee)?|save\.(all|fort|ref|will)|init|speed|hpMax|casterLevel|spellDc|grapple|skill\.[a-z0-9.-]+)$/,
    "Atributo de efeito inválido.",
  );
const modifierSchema = z.object({
  stat: statKey,
  value: z.number().int().min(-50).max(100),
  type: z.enum(BONUS_TYPES),
});
const applySchema = z.object({
  targetType: z.enum(["character", "token"]),
  targetId: id,
  sourceName: singleLine(60),
  modifiers: z.array(modifierSchema).max(20),
  conditionKey: z.string().max(40).optional(),
  rounds: z.number().int().min(1).max(10_000).nullable().optional(),
  casterTokenId: id.nullable().optional(),
});
const diceExpr = z
  .string()
  .max(DICE_LIMITS.maxExpressionLength)
  .refine((v) => {
    try {
      parseExpr(v);
      return true;
    } catch {
      return false;
    }
  }, "Dano inválido (ex.: 1d8+2).");
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const statsSchema = z.object({
  hp: int(-100, 10_000),
  hpMax: int(1, 10_000),
  ac: int(0, 100),
  touch: int(0, 100),
  flatFooted: int(0, 100),
  init: int(-20, 50),
  fort: int(-20, 60),
  ref: int(-20, 60),
  will: int(-20, 60),
  attacks: z
    .array(
      z.object({
        name: singleLine(40),
        bonus: int(-20, 80),
        damage: diceExpr,
        critical: z.string().regex(/^(\d{1,2}-20\/)?x[2-4]$/, "Crítico como 19-20/x2 ou x3."),
      }),
    )
    .max(10),
}) satisfies z.ZodType<NpcStats, unknown>;
const attackSchema = z.object({
  attackerTokenId: id,
  targetTokenId: id,
  attackIndex: int(0, 20),
  modifier: int(-50, 50).optional(),
  iterative: int(0, 3).optional(),
  applyDamage: z.boolean().optional(),
});

const toActive = (e: EffectRecord): ActiveEffect => ({
  id: e.id,
  sourceName: e.sourceName,
  modifiers: e.modifiers,
  ...(e.conditionKey ? { conditionKey: e.conditionKey } : {}),
});

/** Números de combate de um token: personagem pela ficha, NPC pelo bloco simples. */
export async function combatProfile(store: Store, token: TokenRecord, campaignId: string) {
  const effects = await store.listEffects(campaignId);
  if (token.characterId) {
    const c = await store.findCharacter(token.characterId);
    if (c) {
      const mine = effects
        .filter((e) => e.targetType === "character" && e.targetId === c.id)
        .map(toActive);
      const d = deriveCharacter(c.base, mine, SRD);
      return {
        kind: "character" as const,
        character: c,
        init: d.initiative.total,
        ac: d.ac.total.total,
        speed: d.speed.total,
        runMultiplier: d.speed.total ? Math.max(3, Math.round(d.speed.run / d.speed.total)) : 4,
        noRun: d.speed.run === 0 && d.speed.total > 0,
        attacks: d.attacks.map((a) => ({
          name: a.name,
          bonuses: a.bonuses,
          damage: damageExpr(a.damageDice, a.damage.total),
          critical: a.critical,
        })),
      };
    }
  }
  const mine = effects.filter((e) => e.targetType === "token" && e.targetId === token.id);
  const conditionFlags = new Set(
    mine.flatMap((e) => SRD.conditions.find((c) => c.key === e.conditionKey)?.flags ?? []),
  );
  const halve = (n: number) => (conditionFlags.has("halfSpeed") ? Math.floor(n / 10) * 5 : n);
  const npc = token.stats ? deriveNpc(token.stats, mine) : null;
  const speed = conditionFlags.has("noMove")
    ? 0
    : halve(Math.max(0, token.speed + (npc?.speedBonus ?? 0)));
  return {
    kind: "npc" as const,
    init: npc?.init ?? 0,
    ac: npc?.ac ?? null,
    speed,
    runMultiplier: 4,
    noRun: conditionFlags.has("noRun"),
    attacks: (npc?.attacks ?? []).map((a) => ({
      name: a.name,
      bonuses: [a.bonus],
      damage: a.damageBonus
        ? `${a.damage}${a.damageBonus > 0 ? "+" : ""}${a.damageBonus}`
        : a.damage,
      critical: a.critical,
    })),
  };
}

export function combatActions(store: Store, hub: Hub, me: PlayerRecord, rng: DieRng) {
  const { campaignId } = me;
  const gmOnly = () => {
    if (me.role !== "GM") throw new ActionError("Só o mestre faz isso.");
  };
  const loadCombat = async () => {
    const c = await store.getCombat(campaignId);
    if (!c) throw new ActionError("Não há combate.");
    return c;
  };
  const loadToken = async (tokenId: string) => {
    const t = await store.findToken(tokenId);
    const scene = t ? await store.findScene(t.sceneId) : null;
    if (!t || !scene || scene.campaignId !== campaignId)
      throw new ActionError("Token não encontrado.");
    return t;
  };
  const nameOf = (t: TokenRecord) => t.name;
  const rollInit = async (t: TokenRecord) => {
    const { init } = await combatProfile(store, t, campaignId);
    return { id: t.id, bonus: init, roll: rollExpr("1d20", rng).total };
  };
  /** Ordena e mantém a vez de quem estava jogando. */
  const resort = (
    combat: CombatRecord,
    entries: { tokenId: string; initiative: number; bonus?: number }[],
  ) => {
    const current = combat.order[combat.turnIndex]?.tokenId;
    const order = [...entries]
      .sort((a, b) => b.initiative - a.initiative)
      .map(({ tokenId, initiative }) => ({ tokenId, initiative }));
    const idx = order.findIndex((o) => o.tokenId === current);
    return {
      ...combat,
      order,
      turnIndex: idx >= 0 ? idx : Math.min(combat.turnIndex, Math.max(0, order.length - 1)),
    };
  };

  /** Desconta 1 rodada dos efeitos escolhidos; os que zeram saem com aviso no log. */
  async function tick(filter: (e: EffectRecord) => boolean) {
    const effects = (await store.listEffects(campaignId)).filter(
      (e) => e.roundsLeft !== null && filter(e),
    );
    if (!effects.length) return;
    const tokens = await hub.campaignTokens(campaignId);
    for (const e of effects) {
      const left = e.roundsLeft! - 1;
      if (left > 0) await store.updateEffect(e.id, { roundsLeft: left });
      else {
        await store.deleteEffect(e.id);
        const target =
          e.targetType === "character"
            ? (await store.findCharacter(e.targetId))?.name
            : tokens.get(e.targetId);
        const targetName = typeof target === "string" ? target : target?.name;
        const hidden = typeof target === "object" && target?.hidden;
        const text = `${e.sourceName} acabou em ${targetName ?? "?"}.`;
        if (hidden) await hub.systemGm(campaignId, text);
        else await hub.system(campaignId, text);
      }
    }
    await hub.publishEffects(campaignId);
  }

  /** Início do turno: movimento zera e os efeitos de quem age descontam. */
  async function beginTurn(combat: CombatRecord, newRound: boolean) {
    if (newRound) {
      await hub.system(campaignId, `Rodada ${combat.round}.`);
      await tick((e) => e.casterTokenId === null);
    }
    const current = combat.order[combat.turnIndex];
    if (!current) return;
    const t = await store.findToken(current.tokenId);
    if (!t) return;
    const saved = await store.updateToken(t.id, { moveSpent: 0, diagParity: 0 });
    await hub.publishToken(campaignId, saved);
    await tick((e) => e.casterTokenId === t.id);
    const text = `Vez de ${t.name}.`;
    if (t.hidden) await hub.systemGm(campaignId, text);
    else await hub.system(campaignId, text);
  }

  return {
    async start(input: unknown) {
      gmOnly();
      const { sceneId } = z.object({ sceneId: id }).parse(input);
      const scene = await store.findScene(sceneId);
      if (!scene || scene.campaignId !== campaignId) throw new ActionError("Cena não encontrada.");
      if (await store.getCombat(campaignId))
        throw new ActionError("Já há um combate. Encerre antes.");
      const tokens = await store.listTokens(sceneId);
      if (!tokens.length) throw new ActionError("Ponha tokens na cena antes do combate.");
      // Bônus em paralelo; o dado na ordem dos tokens (resultado reproduzível).
      const bonuses = await Promise.all(tokens.map((t) => combatProfile(store, t, campaignId)));
      const rolls = tokens.map((t, i) => ({
        id: t.id,
        bonus: bonuses[i]!.init,
        roll: rollExpr("1d20", rng).total,
      }));
      // Desempate final por sorteio.
      const shuffled = rolls.map((r) => ({ ...r, tie: rng(1000) })).sort((a, b) => a.tie - b.tie);
      const sorted = sortInitiative(shuffled);
      const combat: CombatRecord = {
        campaignId,
        sceneId,
        round: 1,
        turnIndex: 0,
        order: sorted.map((r) => ({ tokenId: r.id, initiative: r.total })),
      };
      await store.saveCombat(combat);
      await store.resetMovement(sceneId);
      const byId = new Map(tokens.map((t) => [t.id, t]));
      const line = (list: typeof sorted) =>
        list.map((r) => `${nameOf(byId.get(r.id)!)} ${r.total}`).join(", ");
      await hub.system(
        campaignId,
        `Combate! Iniciativa: ${line(sorted.filter((r) => !byId.get(r.id)!.hidden))}.`,
      );
      if (tokens.some((t) => t.hidden))
        await hub.systemGm(campaignId, `Iniciativa completa: ${line(sorted)}.`);
      await hub.publishSceneState(campaignId, sceneId);
      await beginTurn(combat, false);
      await hub.publishCombat(campaignId);
      return {};
    },

    async next() {
      const combat = await loadCombat();
      const current = combat.order[combat.turnIndex];
      if (me.role !== "GM") {
        const owners = await hub.owners(campaignId);
        const t = current ? await store.findToken(current.tokenId) : null;
        if (!t?.characterId || owners.get(t.characterId) !== me.id)
          throw new ActionError("Não é a sua vez.");
      }
      let { turnIndex, round } = combat;
      turnIndex++;
      const newRound = turnIndex >= combat.order.length;
      if (newRound) {
        turnIndex = 0;
        round++;
      }
      const next = { ...combat, turnIndex, round };
      await store.saveCombat(next);
      await beginTurn(next, newRound);
      await hub.publishCombat(campaignId);
      return {};
    },

    async end() {
      gmOnly();
      await loadCombat();
      await store.deleteCombat(campaignId);
      await hub.system(campaignId, "Combate encerrado.");
      await hub.publishCombat(campaignId);
      return {};
    },

    async setInitiative(input: unknown) {
      gmOnly();
      const { tokenId, initiative } = z
        .object({ tokenId: id, initiative: int(-50, 100) })
        .parse(input);
      const combat = await loadCombat();
      if (!combat.order.some((o) => o.tokenId === tokenId))
        throw new ActionError("Token fora do combate.");
      await store.saveCombat(
        resort(
          combat,
          combat.order.map((o) => (o.tokenId === tokenId ? { ...o, initiative } : o)),
        ),
      );
      await hub.publishCombat(campaignId);
      return {};
    },

    async add(input: unknown) {
      gmOnly();
      const { tokenId } = z.object({ tokenId: id }).parse(input);
      const combat = await loadCombat();
      const t = await loadToken(tokenId);
      if (t.sceneId !== combat.sceneId) throw new ActionError("Token de outra cena.");
      if (combat.order.some((o) => o.tokenId === tokenId))
        throw new ActionError(`${t.name} já está no combate.`);
      const r = await rollInit(t);
      await store.saveCombat(
        resort(combat, [...combat.order, { tokenId, initiative: r.roll + r.bonus }]),
      );
      const text = `${t.name} entra no combate (iniciativa ${r.roll + r.bonus}).`;
      if (t.hidden) await hub.systemGm(campaignId, text);
      else await hub.system(campaignId, text);
      await hub.publishCombat(campaignId);
      return {};
    },

    async remove(input: unknown) {
      gmOnly();
      const { tokenId } = z.object({ tokenId: id }).parse(input);
      const combat = await loadCombat();
      await removeFromCombat(store, hub, campaignId, combat, tokenId);
      return {};
    },

    async applyEffect(input: unknown) {
      gmOnly();
      const e = applySchema.parse(input);
      let targetName: string;
      let hidden = false;
      if (e.targetType === "character") {
        const c = await store.findCharacter(e.targetId);
        if (!c || c.campaignId !== campaignId) throw new ActionError("Personagem não encontrado.");
        targetName = c.name;
      } else {
        const t = await loadToken(e.targetId);
        targetName = t.name;
        hidden = t.hidden;
      }
      if (e.conditionKey && !SRD.conditions.some((c) => c.key === e.conditionKey)) {
        throw new ActionError("Condição desconhecida.");
      }
      if (e.casterTokenId) await loadToken(e.casterTokenId);
      const created = await store.createEffect({
        // Formato do `stat` já conferido pela regex do schema.
        campaignId,
        targetType: e.targetType,
        targetId: e.targetId,
        sourceName: e.sourceName,
        modifiers: e.modifiers as Modifier[],
        conditionKey: e.conditionKey ?? null,
        roundsLeft: e.rounds ?? null,
        casterTokenId: e.casterTokenId ?? null,
      });
      const text = `${e.sourceName} em ${targetName}${e.rounds ? ` (${e.rounds} rodada${e.rounds > 1 ? "s" : ""})` : ""}.`;
      if (hidden) await hub.systemGm(campaignId, text);
      else await hub.system(campaignId, text);
      await hub.publishEffects(campaignId);
      return { id: created.id };
    },

    async removeEffect(input: unknown) {
      gmOnly();
      const { id: effectId } = z.object({ id }).parse(input);
      const e = (await store.listEffects(campaignId)).find((x) => x.id === effectId);
      if (!e) throw new ActionError("Efeito não encontrado.");
      await store.deleteEffect(effectId);
      await hub.publishEffects(campaignId);
      return {};
    },

    async advanceRound() {
      gmOnly();
      if (await store.getCombat(campaignId))
        throw new ActionError("Em combate as rodadas passam pelos turnos.");
      await hub.system(campaignId, "Uma rodada se passou.");
      await tick(() => true);
      return {};
    },

    async setStats(input: unknown) {
      gmOnly();
      const { id: tokenId, stats } = z.object({ id, stats: statsSchema.nullable() }).parse(input);
      const t = await loadToken(tokenId);
      if (t.characterId) throw new ActionError("Personagem usa a ficha, não o bloco de NPC.");
      const saved = await store.updateToken(tokenId, { stats });
      await hub.publishToken(campaignId, saved);
      return {};
    },

    async attack(input: unknown) {
      const a = attackSchema.parse(input);
      const attacker = await loadToken(a.attackerTokenId);
      const target = await loadToken(a.targetTokenId);
      if (attacker.sceneId !== target.sceneId) throw new ActionError("Alvo em outra cena.");
      if (me.role !== "GM") {
        const owners = await hub.owners(campaignId);
        if (!attacker.characterId || owners.get(attacker.characterId) !== me.id) {
          throw new ActionError("Esse token não é seu.");
        }
        if (target.hidden) throw new ActionError("Token não encontrado.");
        const combat = await store.getCombat(campaignId);
        const inOrder = combat?.order.some((o) => o.tokenId === attacker.id);
        if (combat && inOrder && combat.order[combat.turnIndex]?.tokenId !== attacker.id) {
          throw new ActionError("Não é a sua vez.");
        }
      }
      const from = await combatProfile(store, attacker, campaignId);
      const to = await combatProfile(store, target, campaignId);
      const weapon = from.attacks[a.attackIndex];
      if (!weapon) throw new ActionError("Ataque não encontrado na ficha.");
      if (to.ac === null)
        throw new ActionError(`${target.name} não tem CA (preencha a ficha do NPC).`);
      const bonus = (weapon.bonuses[a.iterative ?? 0] ?? weapon.bonuses[0]!) + (a.modifier ?? 0);
      const crit = parseCritical(weapon.critical);
      const result = resolveAttack(
        {
          bonus,
          targetAc: to.ac,
          critRange: crit.range,
          critMultiplier: crit.multiplier,
          damage: weapon.damage,
        },
        rng,
      );

      const apply = a.applyDamage !== false && result.hit;
      if (apply) {
        if (to.kind === "character") {
          const c = to.character;
          const updated = await store.updateCharacter(c.id, {
            name: c.name,
            base: { ...c.base, hp: { ...c.base.hp, current: c.base.hp.current - result.damage } },
          });
          await hub.publishCharacter(updated);
        } else if (target.stats) {
          const saved = await store.updateToken(target.id, {
            stats: { ...target.stats, hp: target.stats.hp - result.damage },
          });
          await hub.publishToken(campaignId, saved);
        }
      }
      const entry = await store.addLog({
        campaignId,
        kind: "ATTACK",
        visibility: attacker.hidden || target.hidden ? "GM" : "ALL",
        authorId: me.id,
        authorName: me.nickname,
        payload: {
          attackerName: attacker.name,
          targetName: target.name,
          weapon: weapon.name,
          result,
          applied: apply,
        },
      });
      hub.publishLog(campaignId, entry);
      return { hit: result.hit, damage: result.damage };
    },

    /** Limite do turno para o movimento: devolve a mensagem de bloqueio ou null. */
    async moveCheck(token: TokenRecord, cost: number, force: boolean): Promise<string | null> {
      const combat = await store.getCombat(campaignId);
      if (!combat || combat.sceneId !== token.sceneId) return null;
      if (!combat.order.some((o) => o.tokenId === token.id)) return null;
      if (me.role === "GM" && force) return null;
      if (me.role !== "GM" && combat.order[combat.turnIndex]?.tokenId !== token.id)
        return "Não é a sua vez.";
      const p = await combatProfile(store, token, campaignId);
      const b = moveBudgets(p.speed, p.runMultiplier);
      const limit = p.noRun ? b.double : b.run;
      const total = token.moveSpent + cost;
      return total > limit ? `Passou do limite do turno: ${total} de ${limit} quadrados.` : null;
    },
  };
}

/** Tira o token da ordem (token apagado ou removido pelo mestre). */
export async function removeFromCombat(
  store: Store,
  hub: Hub,
  campaignId: string,
  combat: CombatRecord,
  tokenId: string,
) {
  const idx = combat.order.findIndex((o) => o.tokenId === tokenId);
  if (idx < 0) return;
  const order = combat.order.filter((o) => o.tokenId !== tokenId);
  if (!order.length) {
    await store.deleteCombat(campaignId);
    await hub.system(campaignId, "Combate encerrado.");
  } else {
    const turnIndex =
      idx < combat.turnIndex
        ? combat.turnIndex - 1
        : combat.turnIndex >= order.length
          ? 0
          : combat.turnIndex;
    await store.saveCombat({ ...combat, order, turnIndex });
  }
  await hub.publishCombat(campaignId);
}
