import { type Ack, LIMITS, UNAUTHORIZED } from "@mesa/protocol";
import { DICE_LIMITS, DiceError, type DieRng, rollExpr } from "@mesa/rules";
import { z } from "zod";
import type { AssetFiles } from "../lib/assets";
import { TokenBucket } from "../lib/rateLimit";
import { multiLine, singleLine } from "../lib/text";
import { hashToken } from "../lib/tokens";
import type { Store } from "../store/types";
import { ActionError } from "./action";
import { characterActions, toCharacterView } from "./characters";
import { combatActions } from "./combat";
import { handoutActions } from "./handouts";
import { type Hub, type MesaServer, rooms } from "./hub";
import { progressionActions } from "./progression";
import { sceneActions } from "./scenes";

const chatSchema = z.object({ text: multiLine(LIMITS.chat) });
const rollSchema = z.object({
  expr: z.string().max(DICE_LIMITS.maxExpressionLength),
  label: singleLine(LIMITS.rollLabel).optional(),
  hidden: z.boolean().optional(),
});

export type RealtimeOptions = {
  rng: DieRng;
  files: AssetFiles;
  burst?: number;
  perSecond?: number;
};

export function registerHandlers(io: MesaServer, store: Store, hub: Hub, opts: RealtimeOptions) {
  const limiter = new TokenBucket(opts.burst ?? 8, opts.perSecond ?? 2);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) return next(new Error(UNAUTHORIZED));
    try {
      const player = await store.findPlayerByTokenHash(hashToken(token));
      if (!player) return next(new Error(UNAUTHORIZED));
      socket.data.player = player;
      next();
    } catch (err) {
      console.error("[socket] handshake", err);
      next(new Error("Falha ao entrar na mesa."));
    }
  });

  io.on("connection", async (socket) => {
    const me = socket.data.player;
    const { campaignId } = me;
    socket.join([rooms.campaign(campaignId), rooms.player(me.id)]);
    if (me.role === "GM") socket.join(rooms.gm(campaignId));

    const cameOnline = hub.connected(me);
    socket.on("disconnect", () => {
      if (hub.disconnected(me)) {
        limiter.forget(me.id);
        hub.publishPlayers(campaignId).catch((err) => console.error("[socket] presence", err));
      }
    });

    /** Envelopa o handler: valida ack, aplica limite de taxa e traduz erros. */
    const handle =
      // biome-ignore lint/suspicious/noConfusingVoidType: handler pode não devolver dados
        <T, R extends object = object>(fn: (input: T) => Promise<R | void>) =>
        async (input: T, ack?: (res: Ack<R>) => void) => {
          const reply = typeof ack === "function" ? ack : () => {};
          if (!limiter.take(me.id))
            return reply({ ok: false, error: "Calma! Muitas ações seguidas." });
          try {
            const data = await fn(input);
            reply({ ...(data ?? {}), ok: true } as Ack<R>);
          } catch (err) {
            if (err instanceof z.ZodError)
              return reply({ ok: false, error: err.issues[0]!.message });
            if (err instanceof DiceError) return reply({ ok: false, error: err.message });
            if (err instanceof ActionError) {
              return reply({
                ok: false,
                error: err.message,
                ...(err.issues ? { issues: err.issues } : {}),
              });
            }
            console.error("[socket] handler", err);
            reply({ ok: false, error: "Erro interno." });
          }
        };

    socket.on(
      "chat:send",
      handle(async (input) => {
        const { text } = chatSchema.parse(input);
        const entry = await store.addLog({
          campaignId,
          kind: "CHAT",
          visibility: "ALL",
          authorId: me.id,
          authorName: me.nickname,
          payload: { text },
        });
        hub.publishLog(campaignId, entry);
      }),
    );

    socket.on(
      "roll",
      handle(async (input) => {
        const { expr, label, hidden } = rollSchema.parse(input);
        const result = rollExpr(expr, opts.rng);
        const entry = await store.addLog({
          campaignId,
          kind: "ROLL",
          visibility: hidden ? "GM" : "ALL",
          authorId: me.id,
          authorName: me.nickname,
          payload: { ...result, ...(label ? { label } : {}) },
        });
        hub.publishLog(campaignId, entry);
      }),
    );

    const characters = characterActions(store, hub, me, opts.rng);
    socket.on("character:save", handle(characters.save));
    socket.on("character:delete", handle(characters.remove));
    socket.on("character:rollAbilities", handle(characters.rollAbilities));
    socket.on("character:hp", handle(characters.adjustHp));

    const progression = progressionActions(store, hub, me);
    socket.on("campaign:settings", handle(progression.settings));
    socket.on("character:resetRoll", handle(progression.resetRoll));
    socket.on("xp:award", handle(progression.award));

    const combat = combatActions(store, hub, me, opts.rng);
    const scenes = sceneActions(
      store,
      hub,
      opts.files,
      me,
      socket.data,
      (scene) => socket.emit("scene:state", scene),
      combat.moveCheck,
      combat.autoJoin,
    );
    socket.on("combat:start", handle(combat.start));
    socket.on("combat:next", handle(combat.next));
    socket.on("combat:delay", handle(combat.delay));
    socket.on("combat:end", handle(combat.end));
    socket.on("combat:setInitiative", handle(combat.setInitiative));
    socket.on("combat:add", handle(combat.add));
    socket.on("combat:remove", handle(combat.remove));
    socket.on("effect:apply", handle(combat.applyEffect));
    socket.on("effect:remove", handle(combat.removeEffect));
    socket.on("effects:advanceRound", handle(combat.advanceRound));
    socket.on("token:stats", handle(combat.setStats));
    socket.on("attack", handle(combat.attack));

    const handouts = handoutActions(store, hub, opts.files, me);
    socket.on("handout:create", handle(handouts.create));
    socket.on("handout:update", handle(handouts.update));
    socket.on("handout:delete", handle(handouts.remove));
    socket.on("scene:create", handle(scenes.create));
    socket.on("scene:update", handle(scenes.update));
    socket.on("scene:delete", handle(scenes.remove));
    socket.on("scene:activate", handle(scenes.activate));
    socket.on("scene:view", handle(scenes.view));
    socket.on("scene:fog", handle(scenes.fog));
    socket.on("token:resetMovement", handle(scenes.resetMovement));
    socket.on("token:create", handle(scenes.tokenCreate));
    socket.on("token:update", handle(scenes.tokenUpdate));
    socket.on("token:move", handle(scenes.tokenMove));
    socket.on("token:delete", handle(scenes.tokenDelete));

    try {
      const [campaign, players, log, chars, sceneList, activeSceneId, viewing, abilityRoll] =
        await Promise.all([
          store.findCampaign(campaignId),
          hub.players(campaignId),
          store.listLog(campaignId, me, LIMITS.logSnapshot),
          store.listCharacters(campaignId),
          store.listScenes(campaignId),
          store.getActiveSceneId(campaignId),
          hub.viewingScene(socket.data),
          store.getAbilityRoll(me.id),
        ]);
      if (!campaign) return void socket.disconnect(true);
      const { campaignId: _, ...meView } = me;
      socket.emit("state", {
        me: meView,
        campaign,
        players,
        log,
        characters: chars.map((c) => toCharacterView(c, players, meView)),
        activeSceneId,
        scenes: me.role === "GM" ? sceneList : sceneList.filter((x) => x.id === activeSceneId),
        scene: await hub.sceneFor(socket.data, viewing),
        effects: await hub.effectsView(socket.data),
        combat: await hub.combatView(socket.data),
        activeAudio: await hub.activeAudio(campaignId),
        handouts: await hub.handoutsView(socket.data),
        abilityRoll,
      });
      if (cameOnline) {
        socket.broadcast.to(rooms.campaign(campaignId)).emit("players", players);
        store.touchPlayer(me.id).catch((err) => console.error("[socket] touch", err));
      }
    } catch (err) {
      console.error("[socket] snapshot", err);
      socket.disconnect(true);
    }
  });
}
