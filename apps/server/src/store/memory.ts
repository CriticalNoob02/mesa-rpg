import { randomUUID } from "node:crypto";
import type { LogEntryView, Me } from "@mesa/protocol";
import {
  type AssetRecord,
  type CampaignRecord,
  type CharacterRecord,
  type CombatRecord,
  canSee,
  type EffectRecord,
  type HandoutPatch,
  type HandoutRecord,
  type NewLogEntry,
  type PlayerRecord,
  type ScenePatch,
  type SceneRecord,
  type Store,
  type TokenPatch,
  type TokenRecord,
} from "./types";

export class MemoryStore implements Store {
  campaigns: CampaignRecord[] = [];
  players: (PlayerRecord & { tokenHash: string })[] = [];
  log: (LogEntryView & { campaignId: string })[] = [];
  characters: CharacterRecord[] = [];
  scenes: SceneRecord[] = [];
  tokens: TokenRecord[] = [];
  assets: AssetRecord[] = [];
  active = new Map<string, string | null>();
  effects: EffectRecord[] = [];
  handouts: HandoutRecord[] = [];
  combats = new Map<string, CombatRecord>();

  async createCampaign(input: Parameters<Store["createCampaign"]>[0]) {
    if (this.campaigns.some((c) => c.inviteCode === input.inviteCode)) {
      throw new Error("inviteCode duplicado");
    }
    const campaign = { id: randomUUID(), name: input.name, inviteCode: input.inviteCode };
    this.campaigns.push(campaign);
    const gm = await this.addPlayer({ campaignId: campaign.id, role: "GM", ...input.gm });
    return { campaign, gm };
  }

  async findCampaign(id: string) {
    return this.campaigns.find((c) => c.id === id) ?? null;
  }

  async findCampaignByInvite(inviteCode: string) {
    return this.campaigns.find((c) => c.inviteCode === inviteCode) ?? null;
  }

  async addPlayer(input: Parameters<Store["addPlayer"]>[0]) {
    const player = { id: randomUUID(), ...input };
    this.players.push(player);
    const { tokenHash: _, ...record } = player;
    return record;
  }

  async findPlayerByTokenHash(tokenHash: string) {
    const p = this.players.find((x) => x.tokenHash === tokenHash);
    if (!p) return null;
    const { tokenHash: _, ...record } = p;
    return record;
  }

  async listPlayers(campaignId: string) {
    return this.players
      .filter((p) => p.campaignId === campaignId)
      .map(({ tokenHash: _, ...record }) => record);
  }

  async touchPlayer() {}

  async addLog(entry: NewLogEntry) {
    const stored = {
      ...entry,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    } as LogEntryView & {
      campaignId: string;
    };
    this.log.push(stored);
    const { campaignId: _, ...view } = stored;
    return view as LogEntryView;
  }

  async listLog(campaignId: string, viewer: Me, limit: number) {
    return this.log
      .filter((e) => e.campaignId === campaignId && canSee(e, viewer))
      .slice(-limit)
      .map(({ campaignId: _, ...view }) => view as LogEntryView);
  }

  async listCharacters(campaignId: string) {
    return this.characters
      .filter((c) => c.campaignId === campaignId)
      .map((c) => structuredClone(c));
  }

  async findCharacter(id: string) {
    const c = this.characters.find((x) => x.id === id);
    return c ? structuredClone(c) : null;
  }

  async countCharacters(ownerId: string) {
    return this.characters.filter((c) => c.ownerId === ownerId).length;
  }

  async createCharacter(input: Omit<CharacterRecord, "id" | "updatedAt">) {
    const c = { ...structuredClone(input), id: randomUUID(), updatedAt: new Date() };
    this.characters.push(c);
    return structuredClone(c);
  }

  async updateCharacter(id: string, input: Pick<CharacterRecord, "name" | "base">) {
    const c = this.characters.find((x) => x.id === id);
    if (!c) throw new Error("personagem não existe");
    Object.assign(c, structuredClone(input), { updatedAt: new Date() });
    return structuredClone(c);
  }

  async deleteCharacter(id: string) {
    this.characters = this.characters.filter((c) => c.id !== id);
    this.tokens = this.tokens.filter((t) => t.characterId !== id);
  }

  async getActiveSceneId(campaignId: string) {
    return this.active.get(campaignId) ?? null;
  }

  async setActiveScene(campaignId: string, sceneId: string | null) {
    this.active.set(campaignId, sceneId);
  }

  async listScenes(campaignId: string) {
    return this.scenes
      .filter((s) => s.campaignId === campaignId)
      .map(({ id, name }) => ({ id, name }));
  }

  async findScene(id: string) {
    const s = this.scenes.find((x) => x.id === id);
    return s ? structuredClone(s) : null;
  }

  async createScene(input: Omit<SceneRecord, "id">) {
    const s = { ...structuredClone(input), id: randomUUID() };
    this.scenes.push(s);
    return structuredClone(s);
  }

  async updateScene(id: string, patch: ScenePatch) {
    const s = this.scenes.find((x) => x.id === id);
    if (!s) throw new Error("cena não existe");
    Object.assign(s, structuredClone(patch));
    return structuredClone(s);
  }

  async deleteScene(id: string) {
    this.scenes = this.scenes.filter((s) => s.id !== id);
    this.tokens = this.tokens.filter((t) => t.sceneId !== id);
  }

  async assetRefs(assetId: string) {
    return {
      scenes: this.scenes
        .filter((s) => s.assetId === assetId || s.ambientAssetId === assetId)
        .map((s) => structuredClone(s)),
      handouts: this.handouts.filter((h) => h.assetId === assetId).map((h) => structuredClone(h)),
    };
  }

  async listHandouts(campaignId: string) {
    return this.handouts.filter((h) => h.campaignId === campaignId).map((h) => structuredClone(h));
  }

  async findHandout(id: string) {
    const h = this.handouts.find((x) => x.id === id);
    return h ? structuredClone(h) : null;
  }

  async createHandout(input: Omit<HandoutRecord, "id" | "createdAt">) {
    const h = { ...structuredClone(input), id: randomUUID(), createdAt: new Date() };
    this.handouts.push(h);
    return structuredClone(h);
  }

  async updateHandout(id: string, patch: HandoutPatch) {
    const h = this.handouts.find((x) => x.id === id);
    if (!h) throw new Error("handout não existe");
    Object.assign(h, structuredClone(patch));
    return structuredClone(h);
  }

  async deleteHandout(id: string) {
    this.handouts = this.handouts.filter((h) => h.id !== id);
  }

  async listTokens(sceneId: string) {
    return this.tokens.filter((t) => t.sceneId === sceneId).map((t) => structuredClone(t));
  }

  async findToken(id: string) {
    const t = this.tokens.find((x) => x.id === id);
    return t ? structuredClone(t) : null;
  }

  async createToken(input: Omit<TokenRecord, "id">) {
    const t = { ...structuredClone(input), id: randomUUID() };
    this.tokens.push(t);
    return structuredClone(t);
  }

  async updateToken(id: string, patch: TokenPatch) {
    const t = this.tokens.find((x) => x.id === id);
    if (!t) throw new Error("token não existe");
    Object.assign(t, structuredClone(patch));
    return structuredClone(t);
  }

  async resetMovement(sceneId: string) {
    for (const t of this.tokens)
      if (t.sceneId === sceneId) Object.assign(t, { moveSpent: 0, diagParity: 0 });
  }

  async deleteToken(id: string) {
    this.tokens = this.tokens.filter((t) => t.id !== id);
  }

  async createAsset(input: AssetRecord) {
    this.assets.push({ ...input });
    return { ...input };
  }

  async findAsset(id: string) {
    const a = this.assets.find((x) => x.id === id);
    return a ? { ...a } : null;
  }

  async deleteAsset(id: string) {
    this.assets = this.assets.filter((a) => a.id !== id);
  }

  async listEffects(campaignId: string) {
    return this.effects.filter((e) => e.campaignId === campaignId).map((e) => structuredClone(e));
  }

  async createEffect(input: Omit<EffectRecord, "id">) {
    const e = { ...structuredClone(input), id: randomUUID() };
    this.effects.push(e);
    return structuredClone(e);
  }

  async updateEffect(id: string, patch: { roundsLeft: number | null }) {
    const e = this.effects.find((x) => x.id === id);
    if (!e) throw new Error("efeito não existe");
    e.roundsLeft = patch.roundsLeft;
    return structuredClone(e);
  }

  async deleteEffect(id: string) {
    this.effects = this.effects.filter((e) => e.id !== id);
  }

  async deleteEffectsFor(targetType: EffectRecord["targetType"], targetIds: string[]) {
    this.effects = this.effects.filter(
      (e) => !(e.targetType === targetType && targetIds.includes(e.targetId)),
    );
  }

  async getCombat(campaignId: string) {
    const c = this.combats.get(campaignId);
    return c ? structuredClone(c) : null;
  }

  async saveCombat(combat: CombatRecord) {
    this.combats.set(combat.campaignId, structuredClone(combat));
  }

  async deleteCombat(campaignId: string) {
    this.combats.delete(campaignId);
  }
}
