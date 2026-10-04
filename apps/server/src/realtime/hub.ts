import type {
  ActiveAudio,
  ClientToServerEvents,
  LogEntryView,
  PlayerView,
  ServerToClientEvents,
} from "@mesa/protocol";
import type { Server } from "socket.io";
import type { CharacterRecord, PlayerRecord, Store, TokenRecord } from "../store/types";
import { toCharacterView } from "./characters";
import {
  canSeeToken,
  combatFor,
  effectsFor,
  forViewer,
  handoutsFor,
  sceneViewFor,
  tokenView,
} from "./sceneView";

export type SocketData = { player: PlayerRecord; viewingSceneId?: string };
export type MesaServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

export const rooms = {
  campaign: (id: string) => `campaign:${id}`,
  gm: (campaignId: string) => `gm:${campaignId}`,
  player: (id: string) => `player:${id}`,
};

/**
 * Ponto único de saída para os clientes: quem está online e entrega do log
 * respeitando a visibilidade (rolagem oculta só chega ao mestre e ao autor).
 */
export class Hub {
  /** campaignId → playerId → sockets abertos (mesma pessoa em duas abas conta uma vez). */
  private presence = new Map<string, Map<string, number>>();

  constructor(
    private io: MesaServer,
    private store: Store,
  ) {}

  /** Devolve true se a pessoa acabou de ficar online. */
  connected(p: PlayerRecord): boolean {
    const byPlayer = this.presence.get(p.campaignId) ?? new Map<string, number>();
    this.presence.set(p.campaignId, byPlayer);
    const n = (byPlayer.get(p.id) ?? 0) + 1;
    byPlayer.set(p.id, n);
    return n === 1;
  }

  /** Devolve true se a pessoa ficou offline (fechou o último socket). */
  disconnected(p: PlayerRecord): boolean {
    const byPlayer = this.presence.get(p.campaignId);
    const n = (byPlayer?.get(p.id) ?? 1) - 1;
    if (n > 0) {
      byPlayer?.set(p.id, n);
      return false;
    }
    byPlayer?.delete(p.id);
    if (byPlayer?.size === 0) this.presence.delete(p.campaignId);
    return true;
  }

  async players(campaignId: string): Promise<PlayerView[]> {
    const online = this.presence.get(campaignId);
    const list = await this.store.listPlayers(campaignId);
    return list.map(({ id, nickname, role }) => ({
      id,
      nickname,
      role,
      online: (online?.get(id) ?? 0) > 0,
    }));
  }

  async publishPlayers(campaignId: string) {
    this.io.to(rooms.campaign(campaignId)).emit("players", await this.players(campaignId));
  }

  publishLog(campaignId: string, entry: LogEntryView) {
    if (entry.visibility === "ALL") {
      this.io.to(rooms.campaign(campaignId)).emit("log:new", entry);
      return;
    }
    const targets = [
      rooms.gm(campaignId),
      ...(entry.authorId ? [rooms.player(entry.authorId)] : []),
    ];
    this.io.to(targets).emit("log:new", entry);
  }

  /** Linha de sistema no log, para todos. */
  async system(campaignId: string, text: string) {
    const entry = await this.store.addLog({
      campaignId,
      kind: "SYSTEM",
      visibility: "ALL",
      authorId: null,
      authorName: null,
      payload: { text },
    });
    this.publishLog(campaignId, entry);
  }

  /** Resumo para a mesa; ficha completa só para o mestre e o dono. */
  async publishCharacter(c: CharacterRecord) {
    const players = await this.store.listPlayers(c.campaignId);
    const privileged = [rooms.gm(c.campaignId), rooms.player(c.ownerId)];
    this.io
      .to(rooms.campaign(c.campaignId))
      .except(privileged)
      .emit("character:upsert", toCharacterView(c, players, null));
    this.io
      .to(privileged)
      .emit(
        "character:upsert",
        toCharacterView(c, players, { id: c.ownerId, nickname: "", role: "GM" }),
      );
  }

  publishCharacterRemoved(campaignId: string, id: string) {
    this.io.to(rooms.campaign(campaignId)).emit("character:removed", { id });
  }

  /** characterId → ownerId (para saber quem move cada token). */
  async owners(campaignId: string) {
    const chars = await this.store.listCharacters(campaignId);
    return new Map(chars.map((c) => [c.id, c.ownerId]));
  }

  /** Cena que o socket vê: mestre pode estar olhando outra; jogador vê a ativa. */
  async viewingScene(data: SocketData): Promise<string | null> {
    const active = await this.store.getActiveSceneId(data.player.campaignId);
    if (data.player.role !== "GM" || !data.viewingSceneId) return active;
    // A cena que o mestre olhava pode ter sido apagada (em outra aba).
    return (await this.store.findScene(data.viewingSceneId)) ? data.viewingSceneId : active;
  }

  async sceneFor(data: SocketData, sceneId: string | null) {
    if (!sceneId) return null;
    const scene = await this.store.findScene(sceneId);
    if (!scene) return null;
    const [tokens, owners] = await Promise.all([
      this.store.listTokens(sceneId),
      this.owners(scene.campaignId),
    ]);
    const { campaignId: _, ...me } = data.player;
    return sceneViewFor(scene, tokens, owners, me);
  }

  /** Lista para o mestre (todas) e para os jogadores (só a ativa). */
  async publishScenes(campaignId: string) {
    const [scenes, activeSceneId, activeAudio] = await Promise.all([
      this.store.listScenes(campaignId),
      this.store.getActiveSceneId(campaignId),
      this.activeAudio(campaignId),
    ]);
    this.io.to(rooms.gm(campaignId)).emit("scenes", { scenes, activeSceneId, activeAudio });
    this.io
      .to(rooms.campaign(campaignId))
      .except(rooms.gm(campaignId))
      .emit("scenes", {
        scenes: scenes.filter((s) => s.id === activeSceneId),
        activeSceneId,
        activeAudio,
      });
  }

  /** Áudio da cena ativa (todos ouvem o mesmo, mesmo se o mestre olha outra cena). */
  async activeAudio(campaignId: string): Promise<ActiveAudio> {
    const id = await this.store.getActiveSceneId(campaignId);
    const scene = id ? await this.store.findScene(id) : null;
    return scene?.audioUrl ? { url: scene.audioUrl, playing: scene.audioPlaying } : null;
  }

  async handoutsView(data: SocketData) {
    const { campaignId, ...me } = data.player;
    return handoutsFor(await this.store.listHandouts(campaignId), me);
  }

  async publishHandouts(campaignId: string) {
    for (const s of await this.io.in(rooms.campaign(campaignId)).fetchSockets()) {
      s.emit("handouts", await this.handoutsView(s.data));
    }
  }

  /** Reenvia a cena (filtrada por pessoa) para quem a está vendo. */
  async publishSceneState(campaignId: string, sceneId?: string) {
    for (const s of await this.io.in(rooms.campaign(campaignId)).fetchSockets()) {
      const viewing = await this.viewingScene(s.data);
      if (sceneId && viewing !== sceneId) continue;
      s.emit("scene:state", await this.sceneFor(s.data, viewing));
    }
  }

  /** Token novo/alterado: quem não pode mais ver recebe "removed". */
  async publishToken(campaignId: string, t: TokenRecord) {
    const scene = await this.store.findScene(t.sceneId);
    if (!scene) return;
    const view = tokenView(t, await this.owners(campaignId));
    const revealed = new Set(scene.revealed);
    for (const s of await this.io.in(rooms.campaign(campaignId)).fetchSockets()) {
      if ((await this.viewingScene(s.data)) !== t.sceneId) continue;
      const { campaignId: _, ...me } = s.data.player;
      if (canSeeToken(view, scene, me, revealed)) s.emit("token:update", forViewer(view, me));
      else s.emit("token:removed", { id: t.id, sceneId: t.sceneId });
    }
  }

  publishTokenRemoved(campaignId: string, sceneId: string, id: string) {
    this.io.to(rooms.campaign(campaignId)).emit("token:removed", { id, sceneId });
  }

  /** Tokens das cenas da campanha por id (para nomes e quem está oculto). */
  async campaignTokens(campaignId: string) {
    const scenes = await this.store.listScenes(campaignId);
    const all = await Promise.all(scenes.map((sc) => this.store.listTokens(sc.id)));
    return new Map(all.flat().map((t) => [t.id, t]));
  }

  async effectsView(data: SocketData) {
    const [effects, tokens] = await Promise.all([
      this.store.listEffects(data.player.campaignId),
      this.campaignTokens(data.player.campaignId),
    ]);
    const hidden = new Set([...tokens.values()].filter((t) => t.hidden).map((t) => t.id));
    const { campaignId: _, ...me } = data.player;
    return effectsFor(effects, hidden, me);
  }

  async combatView(data: SocketData) {
    const [combat, tokens] = await Promise.all([
      this.store.getCombat(data.player.campaignId),
      this.campaignTokens(data.player.campaignId),
    ]);
    const { campaignId: _, ...me } = data.player;
    return combatFor(combat, tokens, me);
  }

  async publishEffects(campaignId: string) {
    for (const s of await this.io.in(rooms.campaign(campaignId)).fetchSockets()) {
      s.emit("effects", await this.effectsView(s.data));
    }
  }

  async publishCombat(campaignId: string) {
    for (const s of await this.io.in(rooms.campaign(campaignId)).fetchSockets()) {
      s.emit("combat", await this.combatView(s.data));
    }
  }

  /** Linha de log só para o mestre. */
  async systemGm(campaignId: string, text: string) {
    const entry = await this.store.addLog({
      campaignId,
      kind: "SYSTEM",
      visibility: "GM",
      authorId: null,
      authorName: null,
      payload: { text },
    });
    this.publishLog(campaignId, entry);
  }
}
