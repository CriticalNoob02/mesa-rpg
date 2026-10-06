import { levelForXp } from "@mesa/rules";
import { z } from "zod";
import { singleLine } from "../lib/text";
import type { PlayerRecord, Store } from "../store/types";
import { ActionError } from "./action";
import type { Hub } from "./hub";

const id = z.string().min(1).max(40);
const settingsSchema = z.object({
  startLevel: z.number().int().min(1).max(20).optional(),
  hpMode: z.enum(["average", "roll"]).optional(),
});
const awardSchema = z.object({
  awards: z
    .array(z.object({ characterId: id, amount: z.number().int().min(-1_000_000).max(1_000_000) }))
    .min(1)
    .max(50),
  reason: singleLine(80).optional(),
});

const HP_MODE_PT = { average: "média do dado", roll: "rolados no servidor" } as const;

/** Mestre: nível inicial, PV por nível, rolagem de atributos e XP. */
export function progressionActions(store: Store, hub: Hub, me: PlayerRecord) {
  const { campaignId } = me;
  const gmOnly = () => {
    if (me.role !== "GM") throw new ActionError("Só o mestre faz isso.");
  };

  return {
    async settings(input: unknown) {
      gmOnly();
      const patch = settingsSchema.parse(input);
      if (patch.startLevel === undefined && patch.hpMode === undefined) return {};
      const saved = await store.updateCampaignSettings(campaignId, patch);
      hub.publishCampaign(saved);
      const parts = [
        ...(patch.startLevel !== undefined
          ? [`personagens novos começam no nível ${saved.startLevel}`]
          : []),
        ...(patch.hpMode ? [`PV por nível: ${HP_MODE_PT[saved.hpMode]}`] : []),
      ];
      await hub.system(campaignId, `Mestre: ${parts.join("; ")}.`);
      return {};
    },

    async resetRoll(input: unknown) {
      gmOnly();
      const { playerId } = z.object({ playerId: id }).parse(input);
      const player = (await store.listPlayers(campaignId)).find((p) => p.id === playerId);
      if (!player) throw new ActionError("Participante não encontrado.");
      await store.setAbilityRoll(playerId, null);
      hub.publishAbilityRoll(playerId, null);
      await hub.system(
        campaignId,
        `Mestre liberou nova rolagem de atributos para ${player.nickname}.`,
      );
      return {};
    },

    async award(input: unknown) {
      gmOnly();
      const { awards, reason } = awardSchema.parse(input);
      const parts: string[] = [];
      const ready: string[] = [];
      for (const a of awards) {
        if (!a.amount) continue;
        const c = await store.findCharacter(a.characterId);
        if (!c || c.campaignId !== campaignId) throw new ActionError("Personagem não encontrado.");
        const xp = Math.max(0, c.xp + a.amount);
        const saved = await store.updateCharacter(c.id, { name: c.name, base: c.base, xp });
        await hub.publishCharacter(saved);
        parts.push(`${c.name} ${a.amount > 0 ? "+" : ""}${a.amount}`);
        const can = levelForXp(xp);
        if (can > c.base.levels.length && levelForXp(c.xp) <= c.base.levels.length)
          ready.push(`${c.name} (nível ${c.base.levels.length + 1})`);
      }
      if (!parts.length) return {};
      await hub.system(campaignId, `XP${reason ? ` — ${reason}` : ""}: ${parts.join(", ")}.`);
      if (ready.length) await hub.system(campaignId, `Pode subir de nível: ${ready.join(", ")}!`);
      return {};
    },
  };
}
