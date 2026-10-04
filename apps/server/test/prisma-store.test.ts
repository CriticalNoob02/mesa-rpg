import { afterAll, describe, expect, it } from "vitest";
import { createPrisma } from "../src/lib/db";
import { generateInviteCode } from "../src/lib/tokens";
import { PrismaStore } from "../src/store/prisma";

// Contra um Postgres de verdade, só quando TEST_DATABASE_URL vier (ex.: o banco local `mesa`).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PrismaStore", () => {
  const prisma = createPrisma(url ?? "");
  const store = new PrismaStore(prisma);
  const created: string[] = [];

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it("cria campanha, entra jogador e filtra o log oculto", async () => {
    const inviteCode = generateInviteCode();
    const { campaign, gm } = await store.createCampaign({
      name: "Teste",
      inviteCode,
      gm: { nickname: "Mestre", tokenHash: `gm-${inviteCode}` },
    });
    created.push(campaign.id);
    expect(gm).toMatchObject({ role: "GM", campaignId: campaign.id });
    expect(await store.findCampaignByInvite(inviteCode)).toEqual(campaign);

    const p1 = await store.addPlayer({
      campaignId: campaign.id,
      nickname: "Ana",
      role: "PLAYER",
      tokenHash: `p1-${inviteCode}`,
    });
    const p2 = await store.addPlayer({
      campaignId: campaign.id,
      nickname: "Bia",
      role: "PLAYER",
      tokenHash: `p2-${inviteCode}`,
    });
    expect(await store.findPlayerByTokenHash(`p1-${inviteCode}`)).toEqual(p1);
    expect((await store.listPlayers(campaign.id)).map((p) => p.nickname)).toEqual([
      "Mestre",
      "Ana",
      "Bia",
    ]);
    await store.touchPlayer(p1.id);

    const base = { campaignId: campaign.id, authorId: p1.id, authorName: "Ana" };
    await store.addLog({ ...base, kind: "CHAT", visibility: "ALL", payload: { text: "oi" } });
    const hidden = await store.addLog({
      ...base,
      kind: "ROLL",
      visibility: "GM",
      payload: { expr: "1d20", total: 7, terms: [] },
    });
    expect(hidden).toMatchObject({ kind: "ROLL", visibility: "GM", payload: { total: 7 } });

    const kinds = async (viewer: typeof p1) =>
      (await store.listLog(campaign.id, viewer, 10)).map((e) => e.kind);
    expect(await kinds(gm)).toEqual(["CHAT", "ROLL"]);
    expect(await kinds(p1)).toEqual(["CHAT", "ROLL"]);
    expect(await kinds(p2)).toEqual(["CHAT"]);
    expect(await store.listLog(campaign.id, gm, 1)).toEqual([hidden]);
  });
});
