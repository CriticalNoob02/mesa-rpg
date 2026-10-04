import { randomBytes } from "node:crypto";
import { type AssetResponse, LIMITS } from "@mesa/protocol";
import express, { type Request, type RequestHandler, Router } from "express";
import { imageSize } from "image-size";
import type { AssetFiles } from "../lib/assets";
import { hashToken } from "../lib/tokens";
import { handoutSharedWith } from "../realtime/sceneView";
import type { PlayerRecord, Store } from "../store/types";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

async function auth(store: Store, req: Request): Promise<PlayerRecord | null> {
  const token = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1];
  return token ? store.findPlayerByTokenHash(hashToken(token)) : null;
}

/**
 * Imagens da campanha. Upload: corpo cru (`Content-Type: image/*`), só o mestre.
 * Download: qualquer participante da campanha, com o token no header (o web
 * baixa como blob; nada de token em URL).
 */
/**
 * Jogador vê a imagem se ela é mapa de cena, ambiente de narração já revelada
 * ou handout mostrado a ele. Imagem ainda não revelada fica só com o mestre.
 */
async function playerCanSee(store: Store, assetId: string, playerId: string) {
  const refs = await store.assetRefs(assetId);
  return (
    refs.scenes.some(
      (s) => s.assetId === assetId || (s.ambientAssetId === assetId && s.narrationRevealed),
    ) || refs.handouts.some((h) => handoutSharedWith(h, playerId))
  );
}

export function assetsRouter(store: Store, files: AssetFiles, writeLimiter: RequestHandler) {
  const r = Router();

  r.post(
    "/",
    writeLimiter,
    express.raw({ type: "image/*", limit: LIMITS.assetMaxBytes }),
    async (req, res) => {
      const me = await auth(store, req);
      if (!me) return void res.status(401).json({ error: "Sessão inválida." });
      if (me.role !== "GM")
        return void res.status(403).json({ error: "Só o mestre envia imagens." });
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return void res
          .status(400)
          .json({ error: "Envie a imagem no corpo (PNG, JPEG, WebP ou GIF)." });
      }
      let info: ReturnType<typeof imageSize>;
      try {
        info = imageSize(body);
      } catch {
        return void res.status(400).json({ error: "Arquivo não é uma imagem válida." });
      }
      const mime = info.type ? TYPES[info.type] : undefined;
      if (!mime || !info.width || !info.height) {
        return void res.status(400).json({ error: "Formato não aceito (PNG, JPEG, WebP ou GIF)." });
      }
      const id = randomBytes(16).toString("hex");
      const filename = `${id}.${info.type}`;
      await files.save(me.campaignId, filename, body);
      await store.createAsset({
        id,
        campaignId: me.campaignId,
        filename,
        mime,
        size: body.length,
        width: info.width,
        height: info.height,
      });
      res.status(201).json({ id, width: info.width, height: info.height } satisfies AssetResponse);
    },
  );

  r.get("/:id", async (req, res) => {
    const me = await auth(store, req);
    if (!me) return void res.status(401).json({ error: "Sessão inválida." });
    const asset = await store.findAsset(String(req.params.id));
    if (!asset || asset.campaignId !== me.campaignId)
      return void res.status(404).json({ error: "Não encontrado." });
    if (me.role !== "GM" && !(await playerCanSee(store, asset.id, me.id))) {
      return void res.status(404).json({ error: "Não encontrado." });
    }
    const data = await files.read(asset.campaignId, asset.filename);
    res.set({
      "Content-Type": asset.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(data);
  });

  return r;
}
