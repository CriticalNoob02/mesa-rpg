import type {
  CreateCampaignRequest,
  InviteInfoResponse,
  JoinRequest,
  SessionResponse,
  WhoAmIResponse,
} from "@mesa/protocol";
import { LIMITS } from "@mesa/protocol";
import { type RequestHandler, Router } from "express";
import { z } from "zod";
import { singleLine } from "../lib/text";
import { generateInviteCode, generateToken, hashToken, normalizeInviteCode } from "../lib/tokens";
import type { Hub } from "../realtime/hub";
import type { Store } from "../store/types";

const createSchema = z.object({
  name: singleLine(LIMITS.campaignName),
  nickname: singleLine(LIMITS.nickname),
}) satisfies z.ZodType<CreateCampaignRequest, unknown>;

const joinSchema = z.object({
  nickname: singleLine(LIMITS.nickname),
}) satisfies z.ZodType<JoinRequest, unknown>;

export function apiRouter(store: Store, hub: Hub, writeLimiter: RequestHandler) {
  const r = Router();

  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  /** Cria a campanha; quem cria é o mestre e recebe o token do link de mestre. */
  r.post("/campaigns", writeLimiter, async (req, res) => {
    const body = createSchema.parse(req.body);
    const token = generateToken();
    const { campaign } = await store.createCampaign({
      name: body.name,
      inviteCode: generateInviteCode(),
      gm: { nickname: body.nickname, tokenHash: hashToken(token) },
    });
    res.status(201).json({ campaignId: campaign.id, token } satisfies SessionResponse);
  });

  r.get("/invites/:code", async (req, res) => {
    const campaign = await store.findCampaignByInvite(normalizeInviteCode(String(req.params.code)));
    if (!campaign) return void res.status(404).json({ error: "Convite não encontrado." });
    res.json({ campaignId: campaign.id, campaignName: campaign.name } satisfies InviteInfoResponse);
  });

  r.post("/invites/:code/join", writeLimiter, async (req, res) => {
    const body = joinSchema.parse(req.body);
    const campaign = await store.findCampaignByInvite(normalizeInviteCode(String(req.params.code)));
    if (!campaign) return void res.status(404).json({ error: "Convite não encontrado." });

    const token = generateToken();
    const player = await store.addPlayer({
      campaignId: campaign.id,
      nickname: body.nickname,
      role: "PLAYER",
      tokenHash: hashToken(token),
    });
    const entry = await store.addLog({
      campaignId: campaign.id,
      kind: "SYSTEM",
      visibility: "ALL",
      authorId: null,
      authorName: null,
      payload: { text: `${player.nickname} entrou na mesa.` },
    });
    hub.publishLog(campaign.id, entry);
    await hub.publishPlayers(campaign.id);
    res.status(201).json({ campaignId: campaign.id, token } satisfies SessionResponse);
  });

  /** Resolve o token (link de mestre aberto em outro aparelho, por exemplo). */
  r.get("/session", async (req, res) => {
    const token = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1];
    const player = token ? await store.findPlayerByTokenHash(hashToken(token)) : null;
    if (!player) return void res.status(401).json({ error: "Sessão inválida." });
    res.json({
      campaignId: player.campaignId,
      role: player.role,
      nickname: player.nickname,
    } satisfies WhoAmIResponse);
  });

  return r;
}
