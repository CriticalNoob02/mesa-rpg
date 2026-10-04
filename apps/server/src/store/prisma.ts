import type { LogEntryView, Me } from "@mesa/protocol";
import type { CharacterBase, NpcStats } from "@mesa/rules";
import type { Modifier } from "@mesa/srd";
import type {
  Asset,
  Character,
  Effect,
  Handout,
  LogEntry,
  Player,
  PrismaClient,
  Scene,
  Token,
} from "../generated/prisma/client";
import { Prisma } from "../generated/prisma/client";
import type {
  AssetRecord,
  CharacterRecord,
  CombatRecord,
  EffectRecord,
  HandoutPatch,
  HandoutRecord,
  NewLogEntry,
  PlayerRecord,
  ScenePatch,
  SceneRecord,
  Store,
  TokenPatch,
  TokenRecord,
} from "./types";

const toPlayer = (p: Player): PlayerRecord => ({
  id: p.id,
  campaignId: p.campaignId,
  nickname: p.nickname,
  role: p.role,
});

const toLog = (e: LogEntry): LogEntryView =>
  ({
    id: e.id,
    kind: e.kind,
    visibility: e.visibility,
    authorId: e.authorId,
    authorName: e.authorName,
    payload: e.payload,
    createdAt: e.createdAt.toISOString(),
  }) as LogEntryView;

const toCharacter = (c: Character): CharacterRecord => ({
  id: c.id,
  campaignId: c.campaignId,
  ownerId: c.ownerId,
  name: c.name,
  base: c.base as CharacterBase,
  updatedAt: c.updatedAt,
});

const toScene = (s: Scene): SceneRecord => ({
  id: s.id,
  campaignId: s.campaignId,
  name: s.name,
  assetId: s.assetId,
  gridSize: s.gridSize,
  offsetX: s.offsetX,
  offsetY: s.offsetY,
  cols: s.cols,
  rows: s.rows,
  fogEnabled: s.fogEnabled,
  revealed: s.revealed as number[],
  description: s.description,
  ambientAssetId: s.ambientAssetId,
  narrationRevealed: s.narrationRevealed,
  audioUrl: s.audioUrl,
  audioPlaying: s.audioPlaying,
});

const toHandout = (h: Handout): HandoutRecord => ({
  id: h.id,
  campaignId: h.campaignId,
  title: h.title,
  text: h.text,
  assetId: h.assetId,
  recipients: h.recipients as HandoutRecord["recipients"],
  createdAt: h.createdAt,
});

const toToken = (t: Token): TokenRecord => ({
  id: t.id,
  sceneId: t.sceneId,
  characterId: t.characterId,
  name: t.name,
  x: t.x,
  y: t.y,
  size: t.size,
  color: t.color,
  hidden: t.hidden,
  speed: t.speed,
  moveSpent: t.moveSpent,
  diagParity: t.diagParity,
  stats: (t.stats as NpcStats | null) ?? null,
});

const toEffect = (e: Effect): EffectRecord => ({
  id: e.id,
  campaignId: e.campaignId,
  targetType: e.targetType as EffectRecord["targetType"],
  targetId: e.targetId,
  sourceName: e.sourceName,
  modifiers: e.modifiers as Modifier[],
  conditionKey: e.conditionKey,
  roundsLeft: e.roundsLeft,
  casterTokenId: e.casterTokenId,
});

/** Json do Prisma: null de verdade precisa do marcador do client. */
const jsonOrNull = (v: unknown) => (v == null ? Prisma.DbNull : (v as object));

const toAsset = (a: Asset): AssetRecord => ({
  id: a.id,
  campaignId: a.campaignId,
  filename: a.filename,
  mime: a.mime,
  size: a.size,
  width: a.width,
  height: a.height,
});

const campaignSelect = { id: true, name: true, inviteCode: true } as const;

export class PrismaStore implements Store {
  constructor(private db: PrismaClient) {}

  async createCampaign(input: Parameters<Store["createCampaign"]>[0]) {
    const campaign = await this.db.campaign.create({
      data: {
        name: input.name,
        inviteCode: input.inviteCode,
        players: { create: { role: "GM", ...input.gm } },
      },
      include: { players: true },
    });
    const { players, ...rest } = campaign;
    return {
      campaign: { id: rest.id, name: rest.name, inviteCode: rest.inviteCode },
      gm: toPlayer(players[0]!),
    };
  }

  findCampaign(id: string) {
    return this.db.campaign.findUnique({ where: { id }, select: campaignSelect });
  }

  findCampaignByInvite(inviteCode: string) {
    return this.db.campaign.findUnique({ where: { inviteCode }, select: campaignSelect });
  }

  async addPlayer(input: Parameters<Store["addPlayer"]>[0]) {
    return toPlayer(await this.db.player.create({ data: input }));
  }

  async findPlayerByTokenHash(tokenHash: string) {
    const p = await this.db.player.findUnique({ where: { tokenHash } });
    return p ? toPlayer(p) : null;
  }

  async listPlayers(campaignId: string) {
    const rows = await this.db.player.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toPlayer);
  }

  async touchPlayer(id: string) {
    await this.db.player.update({ where: { id }, data: { lastSeenAt: new Date() } });
  }

  async addLog({ campaignId, kind, visibility, authorId, authorName, payload }: NewLogEntry) {
    const row = await this.db.logEntry.create({
      data: { campaignId, kind, visibility, authorId, authorName, payload },
    });
    return toLog(row);
  }

  async listLog(campaignId: string, viewer: Me, limit: number) {
    const rows = await this.db.logEntry.findMany({
      where: {
        campaignId,
        ...(viewer.role === "GM" ? {} : { OR: [{ visibility: "ALL" }, { authorId: viewer.id }] }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.reverse().map(toLog);
  }

  async listCharacters(campaignId: string) {
    const rows = await this.db.character.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toCharacter);
  }

  async findCharacter(id: string) {
    const c = await this.db.character.findUnique({ where: { id } });
    return c ? toCharacter(c) : null;
  }

  countCharacters(ownerId: string) {
    return this.db.character.count({ where: { ownerId } });
  }

  async createCharacter({
    campaignId,
    ownerId,
    name,
    base,
  }: Omit<CharacterRecord, "id" | "updatedAt">) {
    return toCharacter(
      await this.db.character.create({ data: { campaignId, ownerId, name, base } }),
    );
  }

  async updateCharacter(id: string, { name, base }: { name: string; base: CharacterBase }) {
    return toCharacter(await this.db.character.update({ where: { id }, data: { name, base } }));
  }

  async deleteCharacter(id: string) {
    await this.db.character.delete({ where: { id } });
  }

  async getActiveSceneId(campaignId: string) {
    const c = await this.db.campaign.findUnique({
      where: { id: campaignId },
      select: { activeSceneId: true },
    });
    return c?.activeSceneId ?? null;
  }

  async setActiveScene(campaignId: string, sceneId: string | null) {
    await this.db.campaign.update({ where: { id: campaignId }, data: { activeSceneId: sceneId } });
  }

  listScenes(campaignId: string) {
    return this.db.scene.findMany({
      where: { campaignId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async findScene(id: string) {
    const s = await this.db.scene.findUnique({ where: { id } });
    return s ? toScene(s) : null;
  }

  async createScene({ revealed, ...input }: Omit<SceneRecord, "id">) {
    return toScene(await this.db.scene.create({ data: { ...input, revealed } }));
  }

  async updateScene(id: string, patch: ScenePatch) {
    return toScene(await this.db.scene.update({ where: { id }, data: patch }));
  }

  async deleteScene(id: string) {
    await this.db.scene.delete({ where: { id } });
  }

  async assetRefs(assetId: string) {
    const [scenes, handouts] = await Promise.all([
      this.db.scene.findMany({ where: { OR: [{ assetId }, { ambientAssetId: assetId }] } }),
      this.db.handout.findMany({ where: { assetId } }),
    ]);
    return { scenes: scenes.map(toScene), handouts: handouts.map(toHandout) };
  }

  async listHandouts(campaignId: string) {
    const rows = await this.db.handout.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toHandout);
  }

  async findHandout(id: string) {
    const h = await this.db.handout.findUnique({ where: { id } });
    return h ? toHandout(h) : null;
  }

  async createHandout(input: Omit<HandoutRecord, "id" | "createdAt">) {
    return toHandout(await this.db.handout.create({ data: input }));
  }

  async updateHandout(id: string, patch: HandoutPatch) {
    return toHandout(await this.db.handout.update({ where: { id }, data: patch }));
  }

  async deleteHandout(id: string) {
    await this.db.handout.delete({ where: { id } });
  }

  async listTokens(sceneId: string) {
    const rows = await this.db.token.findMany({
      where: { sceneId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toToken);
  }

  async findToken(id: string) {
    const t = await this.db.token.findUnique({ where: { id } });
    return t ? toToken(t) : null;
  }

  async createToken({ stats, ...input }: Omit<TokenRecord, "id">) {
    return toToken(await this.db.token.create({ data: { ...input, stats: jsonOrNull(stats) } }));
  }

  async updateToken(id: string, { stats, ...patch }: TokenPatch) {
    return toToken(
      await this.db.token.update({
        where: { id },
        data: { ...patch, ...(stats !== undefined ? { stats: jsonOrNull(stats) } : {}) },
      }),
    );
  }

  async resetMovement(sceneId: string) {
    await this.db.token.updateMany({ where: { sceneId }, data: { moveSpent: 0, diagParity: 0 } });
  }

  async deleteToken(id: string) {
    await this.db.token.delete({ where: { id } });
  }

  async createAsset(input: AssetRecord) {
    return toAsset(await this.db.asset.create({ data: input }));
  }

  async findAsset(id: string) {
    const a = await this.db.asset.findUnique({ where: { id } });
    return a ? toAsset(a) : null;
  }

  async deleteAsset(id: string) {
    await this.db.asset.delete({ where: { id } });
  }

  async listEffects(campaignId: string) {
    const rows = await this.db.effect.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toEffect);
  }

  async createEffect({ modifiers, ...input }: Omit<EffectRecord, "id">) {
    return toEffect(await this.db.effect.create({ data: { ...input, modifiers } }));
  }

  async updateEffect(id: string, patch: { roundsLeft: number | null }) {
    return toEffect(await this.db.effect.update({ where: { id }, data: patch }));
  }

  async deleteEffect(id: string) {
    await this.db.effect.delete({ where: { id } });
  }

  async deleteEffectsFor(targetType: EffectRecord["targetType"], targetIds: string[]) {
    await this.db.effect.deleteMany({ where: { targetType, targetId: { in: targetIds } } });
  }

  async getCombat(campaignId: string) {
    const c = await this.db.combat.findUnique({ where: { campaignId } });
    return c
      ? {
          campaignId: c.campaignId,
          sceneId: c.sceneId,
          round: c.round,
          turnIndex: c.turnIndex,
          order: c.order as CombatRecord["order"],
        }
      : null;
  }

  async saveCombat({ campaignId, ...data }: CombatRecord) {
    await this.db.combat.upsert({
      where: { campaignId },
      create: { campaignId, ...data },
      update: data,
    });
  }

  async deleteCombat(campaignId: string) {
    await this.db.combat.deleteMany({ where: { campaignId } });
  }
}
