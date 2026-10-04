import { LIMITS } from "@mesa/protocol";
import { z } from "zod";
import type { AssetFiles } from "../lib/assets";
import { singleLine } from "../lib/text";
import type { HandoutPatch, PlayerRecord, Store } from "../store/types";
import { ActionError } from "./action";
import type { Hub } from "./hub";

const id = z.string().min(1).max(40);
const recipients = z.union([z.literal("all"), z.array(id).max(50)]);
const createSchema = z.object({
  title: singleLine(80),
  text: z.string().max(LIMITS.handoutText).optional(),
  assetId: id.nullable().optional(),
  recipients,
});
const updateSchema = z.object({
  id,
  title: singleLine(80).optional(),
  text: z.string().max(LIMITS.handoutText).optional(),
  assetId: id.nullable().optional(),
  recipients: recipients.optional(),
});

/** Handouts: só o mestre cria e escolhe quem vê; o servidor entrega só a quem recebeu. */
export function handoutActions(store: Store, hub: Hub, files: AssetFiles, me: PlayerRecord) {
  const { campaignId } = me;
  const gmOnly = () => {
    if (me.role !== "GM") throw new ActionError("Só o mestre faz isso.");
  };
  const checkAsset = async (assetId: string | null | undefined) => {
    if (!assetId) return;
    const a = await store.findAsset(assetId);
    if (!a || a.campaignId !== campaignId) throw new ActionError("Imagem não encontrada.");
  };
  const checkRecipients = async (list: "all" | string[] | undefined) => {
    if (!list || list === "all") return;
    const players = new Set(
      (await store.listPlayers(campaignId)).filter((p) => p.role === "PLAYER").map((p) => p.id),
    );
    if (list.some((p) => !players.has(p))) throw new ActionError("Destinatário não está na mesa.");
  };
  const load = async (handoutId: string) => {
    const h = await store.findHandout(handoutId);
    if (!h || h.campaignId !== campaignId) throw new ActionError("Handout não encontrado.");
    return h;
  };
  const removeAssetIfUnused = async (assetId: string | null) => {
    if (!assetId) return;
    const refs = await store.assetRefs(assetId);
    if (refs.scenes.length || refs.handouts.length) return;
    const asset = await store.findAsset(assetId);
    if (!asset) return;
    await store.deleteAsset(assetId);
    await files.remove(asset.campaignId, asset.filename);
  };
  const announce = async (title: string, list: "all" | string[]) => {
    const players = await store.listPlayers(campaignId);
    const names =
      list === "all"
        ? "todos"
        : players
            .filter((p) => list.includes(p.id))
            .map((p) => p.nickname)
            .join(", ");
    if (list === "all") await hub.system(campaignId, `O mestre mostrou "${title}" para todos.`);
    else await hub.systemGm(campaignId, `Handout "${title}" mostrado para ${names || "ninguém"}.`);
  };

  return {
    async create(input: unknown) {
      gmOnly();
      const h = createSchema.parse(input);
      if ((await store.listHandouts(campaignId)).length >= LIMITS.handoutsPerCampaign) {
        throw new ActionError(`Máximo de ${LIMITS.handoutsPerCampaign} handouts.`);
      }
      if (!h.text?.trim() && !h.assetId)
        throw new ActionError("Escreva um texto ou envie uma imagem.");
      await checkAsset(h.assetId);
      await checkRecipients(h.recipients);
      const created = await store.createHandout({
        campaignId,
        title: h.title,
        text: h.text ?? "",
        assetId: h.assetId ?? null,
        recipients: h.recipients,
      });
      if (h.recipients === "all" || h.recipients.length)
        await announce(created.title, h.recipients);
      await hub.publishHandouts(campaignId);
      return { id: created.id };
    },

    async update(input: unknown) {
      gmOnly();
      const { id: handoutId, ...patch } = updateSchema.parse(input);
      const h = await load(handoutId);
      await checkAsset(patch.assetId);
      await checkRecipients(patch.recipients);
      const saved = await store.updateHandout(handoutId, patch as HandoutPatch);
      if (!saved.text.trim() && !saved.assetId)
        throw new ActionError("Escreva um texto ou envie uma imagem.");
      if (patch.assetId !== undefined && h.assetId !== saved.assetId)
        await removeAssetIfUnused(h.assetId);
      // Avisa só quem passou a ver.
      if (patch.recipients) {
        const before = h.recipients;
        const added =
          patch.recipients === "all"
            ? before === "all"
              ? []
              : "all"
            : patch.recipients.filter((p) => before !== "all" && !before.includes(p));
        if (added === "all" || added.length) await announce(saved.title, added);
      }
      await hub.publishHandouts(campaignId);
      return {};
    },

    async remove(input: unknown) {
      gmOnly();
      const { id: handoutId } = z.object({ id }).parse(input);
      const h = await load(handoutId);
      await store.deleteHandout(handoutId);
      await removeAssetIfUnused(h.assetId);
      await hub.publishHandouts(campaignId);
      return {};
    },
  };
}
