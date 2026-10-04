import { LIMITS, type SceneView } from "@mesa/protocol";
import { deriveCharacter, moveCost, type NpcStats } from "@mesa/rules";
import { SRD } from "@mesa/srd";
import { MONSTERS } from "@mesa/srd/monsters";
import { z } from "zod";
import type { AssetFiles } from "../lib/assets";
import { singleLine } from "../lib/text";
import type { PlayerRecord, ScenePatch, SceneRecord, Store, TokenRecord } from "../store/types";
import { ActionError } from "./action";
import { removeFromCombat } from "./combat";
import type { Hub, SocketData } from "./hub";

const id = z.string().min(1).max(40);
const cells = z.number().int().min(1).max(LIMITS.gridMaxCells);
const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Cor inválida.");
const size = z.number().int().min(1).max(4);
const speed = z.number().int().min(0).max(200);
const coord = z.number().int().min(0).max(LIMITS.gridMaxCells);

const createSchema = z.object({
  name: singleLine(60),
  cols: cells.optional(),
  rows: cells.optional(),
});
const updateSchema = z.object({
  id,
  name: singleLine(60).optional(),
  assetId: id.nullable().optional(),
  gridSize: z.number().int().min(LIMITS.gridSizeMin).max(LIMITS.gridSizeMax).optional(),
  offsetX: z.number().int().min(0).max(LIMITS.gridSizeMax).optional(),
  offsetY: z.number().int().min(0).max(LIMITS.gridSizeMax).optional(),
  cols: cells.optional(),
  rows: cells.optional(),
  fogEnabled: z.boolean().optional(),
  description: z.string().max(LIMITS.description).optional(),
  ambientAssetId: id.nullable().optional(),
  narrationRevealed: z.boolean().optional(),
  audioUrl: z
    .string()
    .max(LIMITS.audioUrl)
    .url("Link de áudio inválido.")
    .refine((u) => /^https?:\/\//i.test(u), "O link de áudio deve começar com http:// ou https://.")
    .nullable()
    .optional(),
  audioPlaying: z.boolean().optional(),
});
const fogSchema = z.union([
  z.object({ sceneId: id, all: z.literal(true), reveal: z.boolean() }),
  z.object({
    sceneId: id,
    cells: z.array(z.number().int().min(0)).max(LIMITS.gridMaxCells ** 2),
    reveal: z.boolean(),
  }),
]);
const tokenCreateSchema = z.object({
  sceneId: id,
  characterId: id.optional(),
  monsterId: z.string().max(80).optional(),
  name: singleLine(40).optional(),
  x: coord,
  y: coord,
  size: size.optional(),
  color: color.optional(),
  hidden: z.boolean().optional(),
  speed: speed.optional(),
});
const tokenUpdateSchema = z.object({
  id,
  name: singleLine(40).optional(),
  size: size.optional(),
  color: color.optional(),
  hidden: z.boolean().optional(),
  speed: speed.optional(),
});
const moveSchema = z.object({ id, x: coord, y: coord, force: z.boolean().optional() });
const byId = z.object({ id });
const bySceneId = z.object({ sceneId: id });

const PALETTE = ["#d9a45b", "#86c98f", "#7fb2e5", "#e46d61", "#bf9be6", "#e5c07b", "#56b6c2"];

/** Colunas/linhas que cobrem a imagem a partir da origem do grid. */
export function gridFromImage(
  width: number,
  height: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
) {
  const cellsFor = (px: number, off: number) =>
    Math.max(1, Math.min(LIMITS.gridMaxCells, Math.ceil((px - off) / gridSize)));
  return { cols: cellsFor(width, offsetX), rows: cellsFor(height, offsetY) };
}

export function sceneActions(
  store: Store,
  hub: Hub,
  files: AssetFiles,
  me: PlayerRecord,
  data: SocketData,
  emitScene: (scene: SceneView | null) => void,
  moveCheck: (token: TokenRecord, cost: number, force: boolean) => Promise<string | null>,
) {
  const { campaignId } = me;
  const gmOnly = () => {
    if (me.role !== "GM") throw new ActionError("Só o mestre faz isso.");
  };
  const loadScene = async (sceneId: string) => {
    const scene = await store.findScene(sceneId);
    if (!scene || scene.campaignId !== campaignId) throw new ActionError("Cena não encontrada.");
    return scene;
  };
  const loadToken = async (tokenId: string) => {
    const token = await store.findToken(tokenId);
    const scene = token ? await store.findScene(token.sceneId) : null;
    if (!token || !scene || scene.campaignId !== campaignId)
      throw new ActionError("Token não encontrado.");
    return { token, scene };
  };
  /** Mestre mexe em tudo; jogador só no token do próprio personagem, na cena ativa. */
  const canControl = async (token: TokenRecord, scene: SceneRecord) => {
    if (me.role === "GM") return;
    const owners = await hub.owners(campaignId);
    if (!token.characterId || owners.get(token.characterId) !== me.id) {
      throw new ActionError("Esse token não é seu.");
    }
    if ((await store.getActiveSceneId(campaignId)) !== scene.id)
      throw new ActionError("Cena não está ativa.");
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
  const showSelf = async () => emitScene(await hub.sceneFor(data, await hub.viewingScene(data)));

  return {
    async create(input: unknown) {
      gmOnly();
      const { name, cols = 30, rows = 20 } = createSchema.parse(input);
      if ((await store.listScenes(campaignId)).length >= LIMITS.scenesPerCampaign) {
        throw new ActionError(`Máximo de ${LIMITS.scenesPerCampaign} cenas.`);
      }
      const scene = await store.createScene({
        campaignId,
        name,
        assetId: null,
        gridSize: 70,
        offsetX: 0,
        offsetY: 0,
        cols,
        rows,
        fogEnabled: false,
        revealed: [],
        description: "",
        ambientAssetId: null,
        narrationRevealed: false,
        audioUrl: null,
        audioPlaying: false,
      });
      const firstScene = !(await store.getActiveSceneId(campaignId));
      if (firstScene) await store.setActiveScene(campaignId, scene.id);
      data.viewingSceneId = scene.id;
      await hub.publishScenes(campaignId);
      if (firstScene) await hub.publishSceneState(campaignId);
      else await showSelf();
      return { id: scene.id };
    },

    async update(input: unknown) {
      gmOnly();
      const { id: sceneId, ...patch } = updateSchema.parse(input);
      const scene = await loadScene(sceneId);
      const next: ScenePatch = { ...patch };
      for (const assetId of [patch.assetId, patch.ambientAssetId]) {
        if (!assetId) continue;
        const asset = await store.findAsset(assetId);
        if (!asset || asset.campaignId !== campaignId)
          throw new ActionError("Imagem não encontrada.");
      }
      const merged = { ...scene, ...next };
      // Com imagem, o grid acompanha o tamanho dela (a não ser que venha explícito).
      if (merged.assetId && patch.cols === undefined && patch.rows === undefined) {
        const touchedGrid =
          patch.assetId !== undefined ||
          patch.gridSize !== undefined ||
          patch.offsetX !== undefined ||
          patch.offsetY !== undefined;
        const asset = await store.findAsset(merged.assetId);
        if (touchedGrid && asset) {
          Object.assign(
            next,
            gridFromImage(
              asset.width,
              asset.height,
              merged.gridSize,
              merged.offsetX,
              merged.offsetY,
            ),
          );
        }
      }
      const cols = next.cols ?? scene.cols;
      const rows = next.rows ?? scene.rows;
      if (cols !== scene.cols || rows !== scene.rows) next.revealed = []; // índices mudam com o grid
      const saved = await store.updateScene(sceneId, next);
      // Tokens que ficaram fora do grid voltam para dentro.
      for (const t of await store.listTokens(sceneId)) {
        const x = Math.min(t.x, Math.max(0, cols - t.size));
        const y = Math.min(t.y, Math.max(0, rows - t.size));
        if (x !== t.x || y !== t.y) await store.updateToken(t.id, { x, y });
      }
      if (patch.assetId !== undefined && scene.assetId !== saved.assetId)
        await removeAssetIfUnused(scene.assetId);
      if (patch.ambientAssetId !== undefined && scene.ambientAssetId !== saved.ambientAssetId)
        await removeAssetIfUnused(scene.ambientAssetId);
      if (patch.narrationRevealed && !scene.narrationRevealed) {
        await hub.system(campaignId, `O mestre narra: ${saved.name}.`);
      }
      const audioChanged = patch.audioUrl !== undefined || patch.audioPlaying !== undefined;
      if (patch.name || audioChanged) await hub.publishScenes(campaignId);
      await hub.publishSceneState(campaignId, sceneId);
      return {};
    },

    async remove(input: unknown) {
      gmOnly();
      const { id: sceneId } = byId.parse(input);
      const scene = await loadScene(sceneId);
      const tokenIds = (await store.listTokens(sceneId)).map((t) => t.id);
      await store.deleteScene(sceneId);
      await store.deleteEffectsFor("token", tokenIds);
      if ((await store.getCombat(campaignId))?.sceneId === sceneId) {
        await store.deleteCombat(campaignId);
        await hub.publishCombat(campaignId);
      }
      await hub.publishEffects(campaignId);
      await removeAssetIfUnused(scene.assetId);
      await removeAssetIfUnused(scene.ambientAssetId);
      if ((await store.getActiveSceneId(campaignId)) === sceneId) {
        const [first] = await store.listScenes(campaignId);
        await store.setActiveScene(campaignId, first?.id ?? null);
      }
      if (data.viewingSceneId === sceneId) data.viewingSceneId = undefined;
      await hub.publishScenes(campaignId);
      await hub.publishSceneState(campaignId);
      return {};
    },

    async activate(input: unknown) {
      gmOnly();
      const { id: sceneId } = byId.parse(input);
      const scene = await loadScene(sceneId);
      await store.setActiveScene(campaignId, sceneId);
      data.viewingSceneId = undefined;
      await hub.publishScenes(campaignId);
      await hub.publishSceneState(campaignId);
      await hub.system(campaignId, `Cena: ${scene.name}.`);
      return {};
    },

    async view(input: unknown) {
      gmOnly();
      const { id: sceneId } = byId.parse(input);
      await loadScene(sceneId);
      data.viewingSceneId = sceneId;
      await showSelf();
      return {};
    },

    async fog(input: unknown) {
      gmOnly();
      const parsed = fogSchema.parse(input);
      const scene = await loadScene(parsed.sceneId);
      const total = scene.cols * scene.rows;
      let revealed: number[];
      if ("all" in parsed)
        revealed = parsed.reveal ? Array.from({ length: total }, (_, i) => i) : [];
      else {
        const set = new Set(scene.revealed);
        for (const c of parsed.cells) {
          if (c >= total) throw new ActionError("Célula fora do grid.");
          if (parsed.reveal) set.add(c);
          else set.delete(c);
        }
        revealed = [...set].sort((a, b) => a - b);
      }
      await store.updateScene(scene.id, { revealed });
      await hub.publishSceneState(campaignId, scene.id);
      return {};
    },

    async resetMovement(input: unknown) {
      gmOnly();
      const { sceneId } = bySceneId.parse(input);
      await loadScene(sceneId);
      await store.resetMovement(sceneId);
      await hub.publishSceneState(campaignId, sceneId);
      return {};
    },

    async tokenCreate(input: unknown) {
      const t = tokenCreateSchema.parse(input);
      const scene = await loadScene(t.sceneId);
      const tokens = await store.listTokens(scene.id);
      if (tokens.length >= LIMITS.tokensPerScene)
        throw new ActionError(`Máximo de ${LIMITS.tokensPerScene} tokens.`);

      let name = t.name;
      let tokenSpeed = t.speed ?? 30;
      let tokenSize = t.size ?? 1;
      let stats: NpcStats | null = null;
      if (t.characterId) {
        const c = await store.findCharacter(t.characterId);
        if (!c || c.campaignId !== campaignId) throw new ActionError("Personagem não encontrado.");
        if (me.role !== "GM" && c.ownerId !== me.id)
          throw new ActionError("Esse personagem não é seu.");
        if (tokens.some((x) => x.characterId === c.id))
          throw new ActionError(`${c.name} já está nesta cena.`);
        name = c.name;
        try {
          tokenSpeed = deriveCharacter(c.base, [], SRD).speed.total;
        } catch {
          // ficha inconsistente: fica o padrão
        }
      } else if (me.role !== "GM") {
        throw new ActionError("Só o mestre cria tokens de NPC.");
      } else if (t.monsterId) {
        const m = MONSTERS.find((x) => x.id === t.monsterId);
        if (!m) throw new ActionError("Monstro não encontrado.");
        // "Goblin", "Goblin 2", "Goblin 3"… para o mestre distinguir no mapa.
        const base = t.name ?? (m.namePt ?? m.name).split(",")[0]!.trim();
        const same = tokens.filter((x) => x.name === base || x.name.startsWith(`${base} `)).length;
        name = same ? `${base} ${same + 1}` : base;
        tokenSpeed = m.speed;
        tokenSize = t.size ?? Math.min(4, m.squares);
        stats = {
          hp: m.hp,
          hpMax: m.hp,
          ac: m.ac,
          touch: m.touch,
          flatFooted: m.flatFooted,
          init: m.init,
          fort: m.fort,
          ref: m.ref,
          will: m.will,
          attacks: m.attacks.slice(0, 10),
        };
      }
      if (me.role !== "GM") {
        if ((await store.getActiveSceneId(campaignId)) !== scene.id)
          throw new ActionError("Cena não está ativa.");
        if (t.hidden) throw new ActionError("Só o mestre esconde tokens.");
      }
      if (!name) throw new ActionError("Dê um nome ao token.");
      const created = await store.createToken({
        sceneId: scene.id,
        characterId: t.characterId ?? null,
        name,
        x: Math.min(t.x, Math.max(0, scene.cols - tokenSize)),
        y: Math.min(t.y, Math.max(0, scene.rows - tokenSize)),
        size: tokenSize,
        color: t.color ?? PALETTE[tokens.length % PALETTE.length]!,
        hidden: t.hidden ?? false,
        speed: tokenSpeed,
        moveSpent: 0,
        diagParity: 0,
        stats,
      });
      await hub.publishToken(campaignId, created);
      return { id: created.id };
    },

    async tokenUpdate(input: unknown) {
      const { id: tokenId, ...patch } = tokenUpdateSchema.parse(input);
      const { token, scene } = await loadToken(tokenId);
      await canControl(token, scene);
      if (
        me.role !== "GM" &&
        (patch.hidden !== undefined ||
          patch.size !== undefined ||
          patch.name !== undefined ||
          patch.speed !== undefined)
      ) {
        throw new ActionError("Jogador só troca a cor do próprio token.");
      }
      const saved = await store.updateToken(tokenId, patch);
      const fixed =
        patch.size !== undefined
          ? await store.updateToken(tokenId, {
              x: Math.min(saved.x, Math.max(0, scene.cols - saved.size)),
              y: Math.min(saved.y, Math.max(0, scene.rows - saved.size)),
            })
          : saved;
      await hub.publishToken(campaignId, fixed);
      if (patch.hidden !== undefined || patch.name !== undefined) {
        await hub.publishCombat(campaignId);
        await hub.publishEffects(campaignId);
      }
      return {};
    },

    async tokenMove(input: unknown) {
      const { id: tokenId, x, y, force } = moveSchema.parse(input);
      const { token, scene } = await loadToken(tokenId);
      await canControl(token, scene);
      if (x + token.size > scene.cols || y + token.size > scene.rows)
        throw new ActionError("Fora do mapa.");
      const cost = moveCost(token, { x, y }, token.diagParity);
      const blocked = await moveCheck(token, cost.squares, force === true);
      if (blocked) throw new ActionError(blocked);
      const saved = await store.updateToken(tokenId, {
        x,
        y,
        moveSpent: token.moveSpent + cost.squares,
        diagParity: cost.parity,
      });
      await hub.publishToken(campaignId, saved);
      return { cost: cost.squares };
    },

    async tokenDelete(input: unknown) {
      const { id: tokenId } = byId.parse(input);
      const { token, scene } = await loadToken(tokenId);
      await canControl(token, scene);
      await store.deleteToken(tokenId);
      await store.deleteEffectsFor("token", [tokenId]);
      hub.publishTokenRemoved(campaignId, scene.id, tokenId);
      const combat = await store.getCombat(campaignId);
      if (combat) await removeFromCombat(store, hub, campaignId, combat, tokenId);
      await hub.publishEffects(campaignId);
      return {};
    },
  };
}
