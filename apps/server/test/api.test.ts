import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../src/lib/tokens";
import { startServer } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  srv = await startServer();
});
afterEach(() => srv.close());

describe("POST /api/campaigns", () => {
  it("cria campanha com o criador como mestre", async () => {
    const { campaignId, token } = await srv.createCampaign("  A   Tumba ", "Ana");
    const campaign = await srv.store.findCampaign(campaignId);
    expect(campaign).toMatchObject({ name: "A Tumba" });
    expect(campaign!.inviteCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    const gm = await srv.store.findPlayerByTokenHash(hashToken(token));
    expect(gm).toMatchObject({ campaignId, role: "GM", nickname: "Ana" });
  });

  it("não guarda o token em claro", async () => {
    const { token } = await srv.createCampaign();
    expect(JSON.stringify(srv.store.players)).not.toContain(token);
  });

  it.each([
    [{ name: "", nickname: "Ana" }, "obrigatório"],
    [{ name: "x".repeat(61), nickname: "Ana" }, "60"],
    [{ name: "Ok", nickname: "\u0000\u0001" }, "obrigatório"],
    [{ name: "Ok" }, ""],
  ])("valida o corpo %j", async (body, msg) => {
    const res = await srv.api().post("/api/campaigns").send(body).expect(400);
    expect(res.body.error).toContain(msg);
  });

  it("recusa JSON malformado", async () => {
    const res = await srv
      .api()
      .post("/api/campaigns")
      .set("content-type", "application/json")
      .send("{oops")
      .expect(400);
    expect(res.body.error).toBe("JSON inválido.");
  });
});

describe("convites", () => {
  it("mostra o nome da campanha e aceita o código em minúsculas com hífen", async () => {
    const { campaignId } = await srv.createCampaign("Mesa de Sexta");
    const code = (await srv.store.findCampaign(campaignId))!.inviteCode;
    const pretty = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    const res = await srv.api().get(`/api/invites/${pretty}`).expect(200);
    expect(res.body).toEqual({ campaignId, campaignName: "Mesa de Sexta" });
  });

  it("entra como jogador e registra no log", async () => {
    const { campaignId } = await srv.createCampaign();
    const { token, campaignId: joined } = await srv.join(campaignId, "Bruno");
    expect(joined).toBe(campaignId);
    expect(await srv.store.findPlayerByTokenHash(hashToken(token))).toMatchObject({
      role: "PLAYER",
    });
    expect(srv.store.log.at(-1)).toMatchObject({
      kind: "SYSTEM",
      payload: { text: "Bruno entrou na mesa." },
    });
  });

  it("404 para convite inexistente", async () => {
    await srv.api().get("/api/invites/NAOEXISTE").expect(404);
    await srv.api().post("/api/invites/NAOEXISTE/join").send({ nickname: "x" }).expect(404);
  });
});

describe("GET /api/session", () => {
  it("resolve o token", async () => {
    const { campaignId, token } = await srv.createCampaign(undefined, "Ana");
    const res = await srv
      .api()
      .get("/api/session")
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ campaignId, role: "GM", nickname: "Ana" });
  });

  it("401 sem token ou com token inválido", async () => {
    await srv.api().get("/api/session").expect(401);
    await srv.api().get("/api/session").set("authorization", "Bearer nope").expect(401);
  });
});

it("health e 404", async () => {
  await srv.api().get("/api/health").expect(200, { ok: true });
  await srv.api().get("/api/nada").expect(404);
});

it("limita criação por IP quando ligado", async () => {
  const limited = await startServer({ disableWriteLimit: false });
  try {
    for (let i = 0; i < 30; i++) await limited.createCampaign();
    await limited.api().post("/api/campaigns").send({ name: "a", nickname: "b" }).expect(429);
  } finally {
    await limited.close();
  }
});
