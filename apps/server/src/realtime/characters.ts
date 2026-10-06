import type { CharacterView, Me, PlayerView } from "@mesa/protocol";
import { LIMITS } from "@mesa/protocol";
import {
  type CharacterBase,
  type DieRng,
  deriveCharacter,
  levelForXp,
  rollExpr,
  validateCharacter,
  xpForLevel,
} from "@mesa/rules";
import { ABILITIES, SRD } from "@mesa/srd";
import { SPELLS } from "@mesa/srd/spells";
import { z } from "zod";
import { characterBaseSchema } from "../lib/characterSchema";
import type { CharacterRecord, PlayerRecord, Store } from "../store/types";
import { ActionError } from "./action";
import { removeFromCombat } from "./combat";
import type { Hub } from "./hub";

const saveSchema = z.object({ id: z.string().max(40).optional(), base: characterBaseSchema });
const deleteSchema = z.object({ id: z.string().max(40) });
const hpSchema = z.object({
  id: z.string().max(40),
  delta: z.number().int().min(-10_000).max(10_000).optional(),
  temp: z.number().int().min(0).max(10_000).optional(),
  nonlethal: z.number().int().min(0).max(10_000).optional(),
});

export function toCharacterView(
  c: CharacterRecord,
  players: Pick<PlayerView, "id" | "nickname">[],
  viewer: Me | null,
): CharacterView {
  const levels = new Map<string, number>();
  for (const l of c.base.levels) levels.set(l.classId, (levels.get(l.classId) ?? 0) + 1);
  const full = viewer !== null && (viewer.role === "GM" || viewer.id === c.ownerId);
  return {
    id: c.id,
    ownerId: c.ownerId,
    ownerName: players.find((p) => p.id === c.ownerId)?.nickname ?? "?",
    name: c.name,
    raceId: c.base.raceId,
    classes: [...levels].map(([classId, level]) => ({
      classId,
      level,
    })) as CharacterView["classes"],
    updatedAt: c.updatedAt.toISOString(),
    hp: { current: c.base.hp.current, max: hpMax(c.base) },
    xp: c.xp,
    ...(full ? { base: c.base } : {}),
  };
}

const className = (id: string) => SRD.classes.find((k) => k.id === id)?.namePt ?? id;

function describe(c: CharacterRecord) {
  const race = SRD.races.find((r) => r.id === c.base.raceId)?.namePt ?? c.base.raceId;
  const classes = toCharacterView(c, [], null)
    .classes.map((x) => `${className(x.classId)} ${x.level}`)
    .join("/");
  return `${race} ${classes}`;
}

function sameScores(a: number[], b: number[]) {
  const sort = (x: number[]) => [...x].sort((m, n) => m - n);
  const [x, y] = [sort(a), sort(b)];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * Depois de criada, a ficha do jogador só cresce: raça, atributos, níveis já
 * ganhos (com os PV deles) e aumentos escolhidos ficam como estão, e os PV
 * atuais só mudam por `character:hp` ou combate. O mestre muda tudo.
 */
function lockForPlayer(old: CharacterBase, next: CharacterBase): CharacterBase {
  if (
    next.raceId !== old.raceId ||
    next.abilityMethod !== old.abilityMethod ||
    ABILITIES.some((a) => next.abilities[a] !== old.abilities[a])
  ) {
    throw new ActionError("Raça e atributos só o mestre muda depois que a ficha existe.");
  }
  if (next.levels.length < old.levels.length) throw new ActionError("Só o mestre tira níveis.");
  if (old.levels.some((l, i) => next.levels[i]!.classId !== l.classId))
    throw new ActionError("Só o mestre troca a classe de um nível já ganho.");
  if (old.abilityIncreases.some((a, i) => next.abilityIncreases[i] !== a))
    throw new ActionError("Aumentos de atributo já escolhidos não mudam.");
  return {
    ...next,
    levels: next.levels.map((l, i) => old.levels[i] ?? l),
    hp: { ...old.hp },
  };
}

/** Ações de ficha. Dono ou mestre editam; regra do 3.5 validada aqui, não no cliente. */
export function characterActions(store: Store, hub: Hub, me: PlayerRecord, rng: DieRng) {
  const gm = me.role === "GM";
  const canEdit = (c: CharacterRecord) => gm || c.ownerId === me.id;
  const load = async (id: string) => {
    const c = await store.findCharacter(id);
    if (!c || c.campaignId !== me.campaignId) throw new ActionError("Personagem não encontrado.");
    if (!canEdit(c)) throw new ActionError("Só o dono ou o mestre mexem nessa ficha.");
    return c;
  };

  return {
    async save(input: unknown) {
      const { id, base: sent } = saveSchema.parse(input);
      const campaign = (await store.findCampaign(me.campaignId))!;
      const old = id ? await load(id) : null;
      let base = old && !gm ? lockForPlayer(old.base, sent) : sent;

      if (!old && !gm) {
        if (base.levels.length > campaign.startLevel)
          throw new ActionError(`Personagem novo começa no nível ${campaign.startLevel}.`);
        if (base.abilityMethod === "rolled") {
          const roll = await store.getAbilityRoll(me.id);
          if (!roll) throw new ActionError("Role os atributos antes de salvar.");
          if (
            !sameScores(
              roll,
              ABILITIES.map((a) => base.abilities[a]),
            )
          )
            throw new ActionError("Os atributos têm que ser os valores que você rolou.");
        }
      }

      // XP: jogador só sobe até o nível que a experiência permite.
      const level = base.levels.length;
      let xp = old?.xp ?? xpForLevel(level);
      if (old && level > levelForXp(old.xp)) {
        if (!gm) {
          throw new ActionError(
            `${old.name} precisa de ${xpForLevel(level)} XP para o nível ${level} (tem ${old.xp}).`,
          );
        }
        xp = xpForLevel(level);
      }
      if (old && gm && level < old.base.levels.length) xp = Math.min(xp, xpForLevel(level));

      // PV dos níveis novos: média ou dado rolado aqui (sem rerrolar).
      const from = old ? old.base.levels.length : 1;
      const gains: { classId: string; hp: number; roll: boolean }[] = [];
      base = {
        ...base,
        levels: base.levels.map((l, i) => {
          if (i < from) return l;
          const hd = SRD.classes.find((c) => c.id === l.classId)?.hitDie;
          if (!hd) return l;
          const roll = campaign.hpMode === "roll";
          const hp = roll ? rollExpr(`1d${hd}`, rng).total : Math.floor(hd / 2) + 1;
          gains.push({ classId: l.classId, hp, roll });
          return { ...l, hp };
        }),
      };

      // PV atuais: ficha nova nasce cheia; nível novo soma o que ganhou.
      const max = safeHpMax(base);
      if (max !== null) {
        if (!old) base = { ...base, hp: { current: max, nonlethal: 0, temp: 0 } };
        else {
          const current = gains.length
            ? old.base.hp.current + (max - hpMax(old.base))
            : base.hp.current;
          base = { ...base, hp: { ...base.hp, current: Math.min(current, max + base.hp.temp) } };
        }
      }

      const result = validateCharacter(base, SRD, SPELLS);
      if (result.errors.length) throw new ActionError(result.errors[0]!.message, result.errors);

      let saved: CharacterRecord;
      if (old) {
        saved = await store.updateCharacter(old.id, { name: base.name, base, xp });
        if (gains.length) {
          const hp = hpMax(saved.base) - hpMax(old.base);
          const rolled = gains.filter((g) => g.roll).map((g) => g.hp);
          await hub.system(
            me.campaignId,
            `${saved.name} subiu para o nível ${level} (${describe(saved)}): ${hp >= 0 ? "+" : ""}${hp} PV${
              rolled.length ? ` (dado: ${rolled.join(", ")})` : ""
            }.`,
          );
        }
      } else {
        if ((await store.countCharacters(me.id)) >= LIMITS.charactersPerPlayer) {
          throw new ActionError(`Máximo de ${LIMITS.charactersPerPlayer} personagens por pessoa.`);
        }
        saved = await store.createCharacter({
          campaignId: me.campaignId,
          ownerId: me.id,
          name: base.name,
          base,
          xp,
        });
        const rolled = gains.filter((g) => g.roll).map((g) => g.hp);
        await hub.system(
          me.campaignId,
          `${me.nickname} criou ${saved.name} (${describe(saved)}).${
            rolled.length ? ` PV dos níveis rolados: ${rolled.join(", ")}.` : ""
          }`,
        );
      }
      await hub.publishCharacter(saved);
      return { id: saved.id };
    },

    async remove(input: unknown) {
      const { id } = deleteSchema.parse(input);
      const c = await load(id);
      const ofCharacter = [...(await hub.campaignTokens(me.campaignId)).values()]
        .filter((t) => t.characterId === id)
        .map((t) => t.id);
      await store.deleteCharacter(id);
      await store.deleteEffectsFor("character", [id]);
      await store.deleteEffectsFor("token", ofCharacter);
      for (const tokenId of ofCharacter) {
        const combat = await store.getCombat(me.campaignId);
        if (combat) await removeFromCombat(store, hub, me.campaignId, combat, tokenId);
      }
      await hub.publishEffects(me.campaignId);
      hub.publishCharacterRemoved(me.campaignId, id);
      await hub.publishSceneState(me.campaignId); // tokens do personagem somem junto
      await hub.system(me.campaignId, `${me.nickname} removeu a ficha de ${c.name}.`);
      return {};
    },

    /** Uma rolagem por pessoa; pedir de novo devolve a mesma até o mestre liberar. */
    async rollAbilities() {
      const existing = await store.getAbilityRoll(me.id);
      if (existing) return { scores: existing };
      const scores = Array.from({ length: 6 }, () => rollExpr("4d6kh3", rng).total);
      await store.setAbilityRoll(me.id, scores);
      hub.publishAbilityRoll(me.id, scores);
      await hub.system(
        me.campaignId,
        `${me.nickname} rolou atributos (4d6, descarta o menor): ${scores.join(", ")}.`,
      );
      return { scores };
    },

    /** Dano, cura e PV temporários pela ficha, sempre anunciados no log. */
    async adjustHp(input: unknown) {
      const { id, delta, temp, nonlethal } = hpSchema.parse(input);
      const c = await load(id);
      const effects = (await store.listEffects(me.campaignId))
        .filter((e) => e.targetType === "character" && e.targetId === id)
        .map((e) => ({ id: e.id, sourceName: e.sourceName, modifiers: e.modifiers }));
      const max = deriveCharacter(c.base, effects, SRD).hp.total;
      const hp = { ...c.base.hp };
      const parts: string[] = [];
      if (temp !== undefined && temp !== hp.temp) {
        hp.temp = temp;
        parts.push(temp ? `${temp} PV temporários` : "sem PV temporários");
      }
      if (nonlethal !== undefined && nonlethal !== hp.nonlethal) {
        hp.nonlethal = nonlethal;
        parts.push(`${nonlethal} de dano não letal`);
      }
      if (delta) {
        const before = hp.current;
        hp.current = Math.max(-10, Math.min(max + hp.temp, hp.current + delta));
        const real = hp.current - before;
        if (real) parts.push(real > 0 ? `curou ${real}` : `perdeu ${-real}`);
      }
      if (!parts.length) return {};
      const saved = await store.updateCharacter(id, { name: c.name, base: { ...c.base, hp } });
      await hub.publishCharacter(saved);
      await hub.system(
        me.campaignId,
        `${saved.name}: ${parts.join(", ")} (${hp.current}/${max} PV) — por ${me.nickname}.`,
      );
      return {};
    },
  };
}

/** PV máximo pela ficha (sem efeitos temporários). */
function hpMax(base: CharacterBase) {
  return deriveCharacter(base, [], SRD).hp.total;
}

function safeHpMax(base: CharacterBase) {
  try {
    return hpMax(base);
  } catch {
    return null;
  }
}
