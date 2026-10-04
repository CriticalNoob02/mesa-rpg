/**
 * Contrato entre web e server: REST da entrada na mesa e eventos do Socket.IO.
 * Só tipos e limites; validação de verdade é no server.
 */
import type { AttackResult, CharacterBase, Issue, NpcStats, RolledTerm } from "@mesa/rules";
import type { ClassId, Modifier } from "@mesa/srd";

export const LIMITS = {
  nickname: 32,
  campaignName: 60,
  chat: 1000,
  rollLabel: 60,
  logSnapshot: 200,
  charactersPerPlayer: 10,
  scenesPerCampaign: 50,
  tokensPerScene: 200,
  gridMaxCells: 200,
  gridSizeMin: 20,
  gridSizeMax: 400,
  assetMaxBytes: 15 * 1024 * 1024,
  description: 4000,
  handoutsPerCampaign: 200,
  handoutText: 4000,
  audioUrl: 500,
} as const;

export type Role = "GM" | "PLAYER";
export type Visibility = "ALL" | "GM";

export type Me = { id: string; nickname: string; role: Role };
export type PlayerView = Me & { online: boolean };
export type CampaignView = { id: string; name: string; inviteCode: string };

export type ChatPayload = { text: string };
export type RollPayload = { expr: string; label?: string; terms: RolledTerm[]; total: number };
export type SystemPayload = { text: string };
export type AttackPayload = {
  attackerName: string;
  targetName: string;
  weapon: string;
  result: AttackResult;
  /** Dano aplicado nos PV do alvo. */
  applied: boolean;
};

type LogBase = {
  id: string;
  visibility: Visibility;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
};

export type LogEntryView =
  | (LogBase & { kind: "CHAT"; payload: ChatPayload })
  | (LogBase & { kind: "ROLL"; payload: RollPayload })
  | (LogBase & { kind: "SYSTEM"; payload: SystemPayload })
  | (LogBase & { kind: "ATTACK"; payload: AttackPayload });

/** Todos veem o resumo; a ficha completa (`base`) só o dono e o mestre. */
export type CharacterView = {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  raceId: string;
  classes: { classId: ClassId; level: number }[];
  updatedAt: string;
  /** Vida (todos veem, para a barra no token). */
  hp: { current: number; max: number };
  base?: CharacterBase;
};

/** Cena na lista (o jogador só recebe a ativa). */
export type SceneSummary = { id: string; name: string };

/**
 * Grid: célula = `gridSize` px da imagem; a célula (0,0) começa em
 * (`offsetX`, `offsetY`) da imagem. `revealed` = índices `y * cols + x` sem névoa.
 */
export type SceneView = SceneSummary & {
  assetId: string | null;
  gridSize: number;
  offsetX: number;
  offsetY: number;
  cols: number;
  rows: number;
  fogEnabled: boolean;
  revealed: number[];
  tokens: TokenView[];
  /** Texto para ler em voz alta. Jogador só recebe depois que o mestre revela. */
  description: string;
  /** Imagem de ambiente (vai junto com a narração). */
  ambientAssetId: string | null;
  narrationRevealed: boolean;
  audioUrl: string | null;
  audioPlaying: boolean;
};

/** Áudio da cena ativa (vale para todos, mesmo quando o mestre olha outra cena). */
export type ActiveAudio = { url: string; playing: boolean } | null;

/** Texto e/ou imagem que o mestre mostra para alguns jogadores ou todos. */
export type HandoutView = {
  id: string;
  title: string;
  text: string;
  assetId: string | null;
  createdAt: string;
  /** Só o mestre recebe: "all" ou ids dos jogadores. */
  recipients?: "all" | string[];
};

/** Token no grid: (`x`,`y`) = célula do canto superior esquerdo; ocupa `size`×`size`. */
export type TokenView = {
  id: string;
  sceneId: string;
  characterId: string | null;
  /** Dono do personagem (pode mover). */
  ownerId: string | null;
  name: string;
  x: number;
  y: number;
  size: number;
  color: string;
  hidden: boolean;
  /** Deslocamento em pés (NPC; personagens usam a ficha). */
  speed: number;
  /** Quadrados andados desde o último "zerar movimento" (ou o início do turno). */
  moveSpent: number;
  diagParity: number;
  /** Ficha simples de NPC: só o mestre recebe. */
  stats?: NpcStats | null;
};

/** Buff, condição ou efeito sobre um personagem (vale em todas as cenas) ou token de NPC. */
export type EffectView = {
  id: string;
  targetType: "character" | "token";
  targetId: string;
  sourceName: string;
  modifiers: Modifier[];
  conditionKey: string | null;
  /** null = até alguém tirar. */
  roundsLeft: number | null;
  /** Conta no início do turno deste token (quem lançou); sem ele, a cada rodada nova. */
  casterTokenId: string | null;
};

/** Ordem filtrada por pessoa: jogador não vê combatente oculto. */
export type CombatView = {
  sceneId: string;
  round: number;
  /** null para o jogador quando é a vez de um combatente oculto. */
  currentTokenId: string | null;
  order: { tokenId: string; name: string; initiative: number }[];
};

export type TableState = {
  me: Me;
  campaign: CampaignView;
  players: PlayerView[];
  log: LogEntryView[];
  characters: CharacterView[];
  activeSceneId: string | null;
  /** Mestre: todas; jogador: só a ativa. */
  scenes: SceneSummary[];
  /** A cena que este socket está vendo (mestre pode olhar outra antes de ativar). */
  scene: SceneView | null;
  effects: EffectView[];
  combat: CombatView | null;
  activeAudio: ActiveAudio;
  handouts: HandoutView[];
};

export type AckError = { ok: false; error: string; issues?: Issue[] };
export type Ack<T extends object = object> = ({ ok: true } & T) | AckError;

export type ChatInput = { text: string };
export type RollInput = { expr: string; label?: string; hidden?: boolean };

export type CharacterSaveInput = { id?: string; base: CharacterBase };

export type SceneCreateInput = { name: string; cols?: number; rows?: number };
export type SceneUpdateInput = {
  id: string;
  name?: string;
  assetId?: string | null;
  gridSize?: number;
  offsetX?: number;
  offsetY?: number;
  cols?: number;
  rows?: number;
  fogEnabled?: boolean;
  description?: string;
  ambientAssetId?: string | null;
  narrationRevealed?: boolean;
  audioUrl?: string | null;
  audioPlaying?: boolean;
};
export type HandoutInput = {
  title: string;
  text?: string;
  assetId?: string | null;
  recipients: "all" | string[];
};
export type FogInput =
  | { sceneId: string; cells: number[]; reveal: boolean }
  | { sceneId: string; all: true; reveal: boolean };
export type TokenCreateInput = {
  sceneId: string;
  characterId?: string;
  /** Monstro do SRD: nome, tamanho, deslocamento e ficha vêm prontos. */
  monsterId?: string;
  name?: string;
  x: number;
  y: number;
  size?: number;
  color?: string;
  hidden?: boolean;
  speed?: number;
};
export type TokenUpdateInput = {
  id: string;
  name?: string;
  size?: number;
  color?: string;
  hidden?: boolean;
  speed?: number;
};
/** `force`: mestre passa do limite de movimento do turno. */
export type TokenMoveInput = { id: string; x: number; y: number; force?: boolean };
export type EffectApplyInput = {
  targetType: "character" | "token";
  targetId: string;
  sourceName: string;
  modifiers: Modifier[];
  conditionKey?: string;
  rounds?: number | null;
  casterTokenId?: string | null;
};
export type AttackInput = {
  attackerTokenId: string;
  targetTokenId: string;
  /** Índice do ataque na ficha (personagem: armas; NPC: lista de ataques). */
  attackIndex: number;
  /** Modificador da situação (flanco, cobertura…). */
  modifier?: number;
  /** Ataques iterativos: qual deles (0 = o maior). */
  iterative?: number;
  applyDamage?: boolean;
};

export interface ServerToClientEvents {
  state: (state: TableState) => void;
  "log:new": (entry: LogEntryView) => void;
  players: (players: PlayerView[]) => void;
  "character:upsert": (character: CharacterView) => void;
  "character:removed": (input: { id: string }) => void;
  /** Lista de cenas e qual está ativa. */
  scenes: (input: {
    scenes: SceneSummary[];
    activeSceneId: string | null;
    activeAudio: ActiveAudio;
  }) => void;
  handouts: (handouts: HandoutView[]) => void;
  /** Cena que este socket vê, já filtrada (névoa, tokens ocultos). */
  "scene:state": (scene: SceneView | null) => void;
  "token:update": (token: TokenView) => void;
  "token:removed": (input: { id: string; sceneId: string }) => void;
  effects: (effects: EffectView[]) => void;
  combat: (combat: CombatView | null) => void;
}

export interface ClientToServerEvents {
  "chat:send": (input: ChatInput, ack: (res: Ack) => void) => void;
  roll: (input: RollInput, ack: (res: Ack) => void) => void;
  "character:save": (input: CharacterSaveInput, ack: (res: Ack<{ id: string }>) => void) => void;
  "character:delete": (input: { id: string }, ack: (res: Ack) => void) => void;
  /** 6× 4d6 descartando o menor, rolados no servidor e anunciados no log. */
  "character:rollAbilities": (input: object, ack: (res: Ack<{ scores: number[] }>) => void) => void;
  // Mestre
  "scene:create": (input: SceneCreateInput, ack: (res: Ack<{ id: string }>) => void) => void;
  "scene:update": (input: SceneUpdateInput, ack: (res: Ack) => void) => void;
  "scene:delete": (input: { id: string }, ack: (res: Ack) => void) => void;
  "scene:activate": (input: { id: string }, ack: (res: Ack) => void) => void;
  /** Mestre olha uma cena sem mudar a de todos. */
  "scene:view": (input: { id: string }, ack: (res: Ack) => void) => void;
  "scene:fog": (input: FogInput, ack: (res: Ack) => void) => void;
  "token:resetMovement": (input: { sceneId: string }, ack: (res: Ack) => void) => void;
  // Mestre, ou jogador com o próprio personagem
  "token:create": (input: TokenCreateInput, ack: (res: Ack<{ id: string }>) => void) => void;
  "token:update": (input: TokenUpdateInput, ack: (res: Ack) => void) => void;
  "token:move": (input: TokenMoveInput, ack: (res: Ack<{ cost: number }>) => void) => void;
  "token:delete": (input: { id: string }, ack: (res: Ack) => void) => void;
  /** Mestre: ficha simples do NPC (PV, CA, ataques…). */
  "token:stats": (input: { id: string; stats: NpcStats | null }, ack: (res: Ack) => void) => void;
  // Combate (mestre; "next" também pelo dono do combatente da vez)
  "combat:start": (input: { sceneId: string }, ack: (res: Ack) => void) => void;
  "combat:next": (input: object, ack: (res: Ack) => void) => void;
  "combat:end": (input: object, ack: (res: Ack) => void) => void;
  "combat:setInitiative": (
    input: { tokenId: string; initiative: number },
    ack: (res: Ack) => void,
  ) => void;
  "combat:add": (input: { tokenId: string }, ack: (res: Ack) => void) => void;
  "combat:remove": (input: { tokenId: string }, ack: (res: Ack) => void) => void;
  // Efeitos (mestre)
  "effect:apply": (input: EffectApplyInput, ack: (res: Ack<{ id: string }>) => void) => void;
  "effect:remove": (input: { id: string }, ack: (res: Ack) => void) => void;
  /** Fora de combate: o mestre passa uma rodada (durações descontam). */
  "effects:advanceRound": (input: object, ack: (res: Ack) => void) => void;
  attack: (input: AttackInput, ack: (res: Ack<{ hit: boolean; damage: number }>) => void) => void;
  // Handouts (mestre)
  "handout:create": (input: HandoutInput, ack: (res: Ack<{ id: string }>) => void) => void;
  "handout:update": (
    input: Partial<HandoutInput> & { id: string },
    ack: (res: Ack) => void,
  ) => void;
  "handout:delete": (input: { id: string }, ack: (res: Ack) => void) => void;
}

/** Erro do handshake quando o token não vale (o cliente descarta a sessão). */
export const UNAUTHORIZED = "unauthorized";

// REST
export type CreateCampaignRequest = { name: string; nickname: string };
export type SessionResponse = { campaignId: string; token: string };
export type InviteInfoResponse = { campaignId: string; campaignName: string };
export type JoinRequest = { nickname: string };
export type AssetResponse = { id: string; width: number; height: number };
export type WhoAmIResponse = { campaignId: string; role: Role; nickname: string };
export type ApiError = { error: string };
