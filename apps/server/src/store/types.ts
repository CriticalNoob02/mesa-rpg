import type {
  CampaignSettings,
  EffectView,
  LogEntryView,
  Me,
  Role,
  SceneSummary,
  SceneView,
  TokenView,
  Visibility,
} from "@mesa/protocol";
import type { CharacterBase } from "@mesa/rules";

export type CampaignRecord = { id: string; name: string; inviteCode: string } & CampaignSettings;
export type PlayerRecord = Me & { campaignId: string };

export type CharacterRecord = {
  id: string;
  campaignId: string;
  ownerId: string;
  name: string;
  base: CharacterBase;
  xp: number;
  updatedAt: Date;
};

export type SceneRecord = Omit<SceneView, "tokens"> & { campaignId: string };
/** Dono vem do personagem; o store não guarda. */
export type TokenRecord = Omit<TokenView, "ownerId">;
export type AssetRecord = {
  id: string;
  campaignId: string;
  filename: string;
  mime: string;
  size: number;
  width: number;
  height: number;
};
export type HandoutRecord = {
  id: string;
  campaignId: string;
  title: string;
  text: string;
  assetId: string | null;
  recipients: "all" | string[];
  createdAt: Date;
};
export type HandoutPatch = Partial<
  Pick<HandoutRecord, "title" | "text" | "assetId" | "recipients">
>;

export type EffectRecord = EffectView & { campaignId: string };
export type CombatRecord = {
  campaignId: string;
  sceneId: string;
  round: number;
  turnIndex: number;
  /** `delayed`: adiou e volta a agir sem recomeçar o turno. */
  order: { tokenId: string; initiative: number; delayed?: boolean }[];
};

export type ScenePatch = Partial<Omit<SceneRecord, "id" | "campaignId">>;
export type TokenPatch = Partial<Omit<TokenRecord, "id" | "sceneId">>;

export type NewLogEntry = Omit<LogEntryView, "id" | "createdAt"> & { campaignId: string };

/**
 * Persistência da mesa. Prisma em produção; memória nos testes (mesma semântica,
 * sem banco).
 */
export interface Store {
  createCampaign(input: {
    name: string;
    inviteCode: string;
    gm: { nickname: string; tokenHash: string };
  }): Promise<{ campaign: CampaignRecord; gm: PlayerRecord }>;
  findCampaign(id: string): Promise<CampaignRecord | null>;
  findCampaignByInvite(inviteCode: string): Promise<CampaignRecord | null>;
  updateCampaignSettings(id: string, patch: Partial<CampaignSettings>): Promise<CampaignRecord>;
  addPlayer(input: {
    campaignId: string;
    nickname: string;
    role: Role;
    tokenHash: string;
  }): Promise<PlayerRecord>;
  findPlayerByTokenHash(tokenHash: string): Promise<PlayerRecord | null>;
  listPlayers(campaignId: string): Promise<PlayerRecord[]>;
  touchPlayer(id: string): Promise<void>;
  getAbilityRoll(playerId: string): Promise<number[] | null>;
  setAbilityRoll(playerId: string, scores: number[] | null): Promise<void>;
  addLog(entry: NewLogEntry): Promise<LogEntryView>;
  /** Últimas `limit` entradas que o participante pode ver, da mais antiga à mais nova. */
  listLog(campaignId: string, viewer: Me, limit: number): Promise<LogEntryView[]>;
  listCharacters(campaignId: string): Promise<CharacterRecord[]>;
  findCharacter(id: string): Promise<CharacterRecord | null>;
  countCharacters(ownerId: string): Promise<number>;
  createCharacter(input: Omit<CharacterRecord, "id" | "updatedAt">): Promise<CharacterRecord>;
  updateCharacter(
    id: string,
    input: { name: string; base: CharacterBase; xp?: number },
  ): Promise<CharacterRecord>;
  /** Apaga também os tokens do personagem. */
  deleteCharacter(id: string): Promise<void>;

  getActiveSceneId(campaignId: string): Promise<string | null>;
  setActiveScene(campaignId: string, sceneId: string | null): Promise<void>;
  listScenes(campaignId: string): Promise<SceneSummary[]>;
  findScene(id: string): Promise<SceneRecord | null>;
  createScene(input: Omit<SceneRecord, "id">): Promise<SceneRecord>;
  updateScene(id: string, patch: ScenePatch): Promise<SceneRecord>;
  deleteScene(id: string): Promise<void>;
  /** Quem usa a imagem: mapa/ambiente de cena ou handout. */
  assetRefs(assetId: string): Promise<{ scenes: SceneRecord[]; handouts: HandoutRecord[] }>;

  listTokens(sceneId: string): Promise<TokenRecord[]>;
  findToken(id: string): Promise<TokenRecord | null>;
  createToken(input: Omit<TokenRecord, "id">): Promise<TokenRecord>;
  updateToken(id: string, patch: TokenPatch): Promise<TokenRecord>;
  resetMovement(sceneId: string): Promise<void>;
  deleteToken(id: string): Promise<void>;

  createAsset(input: Omit<AssetRecord, "id"> & { id: string }): Promise<AssetRecord>;
  findAsset(id: string): Promise<AssetRecord | null>;
  deleteAsset(id: string): Promise<void>;

  listEffects(campaignId: string): Promise<EffectRecord[]>;
  createEffect(input: Omit<EffectRecord, "id">): Promise<EffectRecord>;
  updateEffect(id: string, patch: { roundsLeft: number | null }): Promise<EffectRecord>;
  deleteEffect(id: string): Promise<void>;
  deleteEffectsFor(targetType: EffectRecord["targetType"], targetIds: string[]): Promise<void>;

  listHandouts(campaignId: string): Promise<HandoutRecord[]>;
  findHandout(id: string): Promise<HandoutRecord | null>;
  createHandout(input: Omit<HandoutRecord, "id" | "createdAt">): Promise<HandoutRecord>;
  updateHandout(id: string, patch: HandoutPatch): Promise<HandoutRecord>;
  deleteHandout(id: string): Promise<void>;

  getCombat(campaignId: string): Promise<CombatRecord | null>;
  saveCombat(combat: CombatRecord): Promise<void>;
  deleteCombat(campaignId: string): Promise<void>;
}

export function canSee(entry: { visibility: Visibility; authorId: string | null }, viewer: Me) {
  return entry.visibility === "ALL" || viewer.role === "GM" || entry.authorId === viewer.id;
}
