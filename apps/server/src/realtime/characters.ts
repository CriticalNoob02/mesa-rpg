import type { CharacterView, Me, PlayerView } from "@mesa/protocol";
import { LIMITS } from "@mesa/protocol";
import { type DieRng, rollExpr, validateCharacter } from "@mesa/rules";
import { SRD } from "@mesa/srd";
import { SPELLS } from "@mesa/srd/spells";
import { z } from "zod";
import { characterBaseSchema } from "../lib/characterSchema";
import type { CharacterRecord, PlayerRecord, Store } from "../store/types";
import { ActionError } from "./action";
import { removeFromCombat } from "./combat";
import type { Hub } from "./hub";

const saveSchema = z.object({ id: z.string().max(40).optional(), base: characterBaseSchema });
const deleteSchema = z.object({ id: z.string().max(40) });

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
    ...(full ? { base: c.base } : {}),
  };
}

function describe(c: CharacterRecord) {
  const race = SRD.races.find((r) => r.id === c.base.raceId)?.namePt ?? c.base.raceId;
  const classes = toCharacterView(c, [], null)
    .classes.map(
      (x) => `${SRD.classes.find((k) => k.id === x.classId)?.namePt ?? x.classId} ${x.level}`,
    )
    .join("/");
  return `${race} ${classes}`;
}

/** Ações de ficha. Dono ou mestre editam; regra do 3.5 validada aqui, não no cliente. */
export function characterActions(store: Store, hub: Hub, me: PlayerRecord, rng: DieRng) {
  const canEdit = (c: CharacterRecord) => me.role === "GM" || c.ownerId === me.id;
  const load = async (id: string) => {
    const c = await store.findCharacter(id);
    if (!c || c.campaignId !== me.campaignId) throw new ActionError("Personagem não encontrado.");
    if (!canEdit(c)) throw new ActionError("Só o dono ou o mestre mexem nessa ficha.");
    return c;
  };

  return {
    async save(input: unknown) {
      const { id, base } = saveSchema.parse(input);
      const result = validateCharacter(base, SRD, SPELLS);
      if (result.errors.length) throw new ActionError(result.errors[0]!.message, result.errors);

      let saved: CharacterRecord;
      if (id) {
        await load(id);
        saved = await store.updateCharacter(id, { name: base.name, base });
      } else {
        if ((await store.countCharacters(me.id)) >= LIMITS.charactersPerPlayer) {
          throw new ActionError(`Máximo de ${LIMITS.charactersPerPlayer} personagens por pessoa.`);
        }
        saved = await store.createCharacter({
          campaignId: me.campaignId,
          ownerId: me.id,
          name: base.name,
          base,
        });
        await hub.system(me.campaignId, `${me.nickname} criou ${saved.name} (${describe(saved)}).`);
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

    async rollAbilities() {
      const scores = Array.from({ length: 6 }, () => rollExpr("4d6kh3", rng).total);
      await hub.system(
        me.campaignId,
        `${me.nickname} rolou atributos (4d6, descarta o menor): ${scores.join(", ")}.`,
      );
      return { scores };
    },
  };
}
