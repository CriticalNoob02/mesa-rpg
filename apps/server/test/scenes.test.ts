import { existsSync } from "node:fs";
import path from "node:path";
import type { SceneView, TokenView } from "@mesa/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { tordek } from "./fixtures";
import { type Client, emit, startServer } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;
afterEach(() => srv?.close());

/** PNG mínimo com só a assinatura e o IHDR (o suficiente para ler as dimensões). */
function png(width: number, height: number) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf.writeUInt8(8, 24);
  buf.writeUInt8(6, 25);
  return buf;
}

const next = <T>(
  socket: Client,
  event: "scene:state" | "token:update" | "token:removed" | "scenes",
) => new Promise<T>((resolve) => (socket.once as any)(event, resolve));

/** Espera um tempo e devolve o que chegou (para provar que algo não chegou). */
async function collect<T>(socket: Client, event: string, ms = 80) {
  const got: T[] = [];
  const fn = (x: T) => got.push(x);
  (socket.on as any)(event, fn);
  await new Promise((r) => setTimeout(r, ms));
  (socket.off as any)(event, fn);
  return got;
}

async function table() {
  srv = await startServer();
  const gmS = await srv.createCampaign("Mesa", "Mestre");
  const anaS = await srv.join(gmS.campaignId, "Ana");
  const gm = await srv.connect(gmS.token);
  const ana = await srv.connect(anaS.token);
  return { gm, ana, gmToken: gmS.token, anaToken: anaS.token, campaignId: gmS.campaignId };
}

async function withScene() {
  const t = await table();
  const atAna = next<SceneView>(t.ana.socket, "scene:state");
  const res: any = await emit(t.gm.socket, "scene:create", { name: "Caverna", cols: 10, rows: 8 });
  expect(res.ok).toBe(true);
  const scene = await atAna;
  return { ...t, sceneId: res.id as string, scene };
}

describe("cenas", () => {
  it("primeira cena vira a ativa e chega a todos", async () => {
    const { scene, ana, gm } = await withScene();
    expect(scene).toMatchObject({ name: "Caverna", cols: 10, rows: 8, tokens: [] });
    const late = await srv.connect((await srv.join(ana.state.campaign.id, "Caio")).token);
    expect(late.state.scene?.name).toBe("Caverna");
    expect(late.state.scenes).toEqual([{ id: scene.id, name: "Caverna" }]);
    expect(gm.socket.connected).toBe(true);
  });

  it("jogador não cria nem mexe em cena", async () => {
    const { ana, sceneId } = await withScene();
    expect(await emit(ana.socket, "scene:create", { name: "x" })).toEqual({
      ok: false,
      error: "Só o mestre faz isso.",
    });
    expect(await emit(ana.socket, "scene:fog", { sceneId, all: true, reveal: true })).toMatchObject(
      { ok: false },
    );
  });

  it("mestre olha outra cena sem mudar a dos jogadores; ativar troca para todos", async () => {
    const { gm, ana, sceneId } = await withScene();
    const res: any = await emit(gm.socket, "scene:create", { name: "Taverna" });
    const anaGot = collect<SceneView>(ana.socket, "scene:state");
    await emit(gm.socket, "scene:view", { id: sceneId });
    await emit(gm.socket, "scene:view", { id: res.id });
    expect(await anaGot).toEqual([]);

    const anaScene = next<SceneView>(ana.socket, "scene:state");
    const anaList = next<any>(ana.socket, "scenes");
    await emit(gm.socket, "scene:activate", { id: res.id });
    expect((await anaScene).name).toBe("Taverna");
    expect((await anaList).scenes).toEqual([{ id: res.id, name: "Taverna" }]);
    expect(srv.store.log.at(-1)!.payload).toEqual({ text: "Cena: Taverna." });
  });

  it("apagar a cena ativa ativa outra", async () => {
    const { gm, ana, sceneId } = await withScene();
    const other: any = await emit(gm.socket, "scene:create", { name: "Taverna" });
    const anaScene = next<SceneView>(ana.socket, "scene:state");
    await emit(gm.socket, "scene:delete", { id: sceneId });
    expect((await anaScene).id).toBe(other.id);
  });
});

describe("imagens", () => {
  it("mestre envia; jogador da campanha baixa; grid acompanha a imagem", async () => {
    const { gmToken, anaToken, gm, sceneId } = await withScene();
    await srv
      .api()
      .post("/api/assets")
      .set("authorization", `Bearer ${anaToken}`)
      .set("content-type", "image/png")
      .send(png(10, 10))
      .expect(403);
    await srv
      .api()
      .post("/api/assets")
      .set("content-type", "image/png")
      .send(png(10, 10))
      .expect(401);
    await srv
      .api()
      .post("/api/assets")
      .set("authorization", `Bearer ${gmToken}`)
      .set("content-type", "image/png")
      .send(Buffer.from("not an image"))
      .expect(400);

    const up = await srv
      .api()
      .post("/api/assets")
      .set("authorization", `Bearer ${gmToken}`)
      .set("content-type", "image/png")
      .send(png(700, 455))
      .expect(201);
    expect(up.body).toMatchObject({ width: 700, height: 455 });

    // Antes de virar mapa, a imagem é só do mestre.
    await srv
      .api()
      .get(`/api/assets/${up.body.id}`)
      .set("authorization", `Bearer ${anaToken}`)
      .expect(404);
    await srv
      .api()
      .get(`/api/assets/${up.body.id}`)
      .set("authorization", `Bearer ${gmToken}`)
      .expect(200);
    await emit(gm.socket, "scene:update", { id: sceneId, assetId: up.body.id });

    const dl = await srv
      .api()
      .get(`/api/assets/${up.body.id}`)
      .set("authorization", `Bearer ${anaToken}`)
      .expect(200);
    expect(dl.headers["content-type"]).toBe("image/png");
    await srv.api().get(`/api/assets/${up.body.id}`).expect(401);
    const outsider = await srv.createCampaign("Outra", "X");
    await srv
      .api()
      .get(`/api/assets/${up.body.id}`)
      .set("authorization", `Bearer ${outsider.token}`)
      .expect(404);

    expect(
      await emit(gm.socket, "scene:update", {
        id: sceneId,
        assetId: up.body.id,
        gridSize: 70,
        offsetX: 35,
      }),
    ).toEqual({ ok: true });
    expect(await srv.store.findScene(sceneId)).toMatchObject({ cols: 10, rows: 7, offsetX: 35 });

    // Trocar a imagem apaga a antiga do disco quando ninguém mais usa.
    const file = path.join(srv.assetsDir, gm.state.campaign.id, srv.store.assets[0]!.filename);
    expect(existsSync(file)).toBe(true);
    await emit(gm.socket, "scene:update", { id: sceneId, assetId: null });
    expect(existsSync(file)).toBe(false);
    expect(srv.store.assets).toHaveLength(0);
  });

  it("recusa imagem de outra campanha na cena", async () => {
    const { gm, sceneId } = await withScene();
    const outsider = await srv.createCampaign("Outra", "X");
    const up = await srv
      .api()
      .post("/api/assets")
      .set("authorization", `Bearer ${outsider.token}`)
      .set("content-type", "image/png")
      .send(png(70, 70));
    expect(await emit(gm.socket, "scene:update", { id: sceneId, assetId: up.body.id })).toEqual({
      ok: false,
      error: "Imagem não encontrada.",
    });
  });
});

describe("tokens e névoa", () => {
  it("token oculto só o mestre vê; ao revelar chega ao jogador", async () => {
    const { gm, ana, sceneId } = await withScene();
    const anaGot = collect<TokenView>(ana.socket, "token:update");
    const gmGot = next<TokenView>(gm.socket, "token:update");
    const res: any = await emit(gm.socket, "token:create", {
      sceneId,
      name: "Goblin",
      x: 2,
      y: 2,
      hidden: true,
    });
    expect((await gmGot).name).toBe("Goblin");
    expect(await anaGot).toEqual([]);

    const anaSees = next<TokenView>(ana.socket, "token:update");
    await emit(gm.socket, "token:update", { id: res.id, hidden: false });
    expect((await anaSees).name).toBe("Goblin");
  });

  it("névoa esconde token do jogador até revelar a célula", async () => {
    const { gm, ana, sceneId } = await withScene();
    await emit(gm.socket, "token:create", { sceneId, name: "Ogro", x: 3, y: 1, size: 2 });
    const fogged = next<SceneView>(ana.socket, "scene:state");
    await emit(gm.socket, "scene:update", { id: sceneId, fogEnabled: true });
    expect((await fogged).tokens).toEqual([]);

    const revealed = next<SceneView>(ana.socket, "scene:state");
    await emit(gm.socket, "scene:fog", { sceneId, cells: [2 * 10 + 4], reveal: true }); // célula (4,2) do ogro 2×2
    const view = await revealed;
    expect(view.revealed).toEqual([24]);
    expect(view.tokens.map((t) => t.name)).toEqual(["Ogro"]);

    expect(await emit(gm.socket, "scene:fog", { sceneId, cells: [999], reveal: true })).toEqual({
      ok: false,
      error: "Célula fora do grid.",
    });
    const all = next<SceneView>(ana.socket, "scene:state");
    await emit(gm.socket, "scene:fog", { sceneId, all: true, reveal: true });
    expect((await all).revealed).toHaveLength(80);
  });

  it("jogador põe e move o próprio token; custo 1-2-1 acumula; mestre zera", async () => {
    const { gm, ana, sceneId } = await withScene();
    const { id: charId }: any = await emit(ana.socket, "character:save", { base: tordek() });
    const put: any = await emit(ana.socket, "token:create", {
      sceneId,
      characterId: charId,
      x: 0,
      y: 0,
    });
    expect(put.ok).toBe(true);
    const tok = srv.store.tokens[0]!;
    expect(tok).toMatchObject({ name: "Tordek", speed: 20 });
    expect(
      await emit(ana.socket, "token:create", { sceneId, characterId: charId, x: 1, y: 1 }),
    ).toEqual({
      ok: false,
      error: "Tordek já está nesta cena.",
    });

    const gmSees = next<TokenView>(gm.socket, "token:update");
    expect(await emit(ana.socket, "token:move", { id: put.id, x: 1, y: 1 })).toEqual({
      ok: true,
      cost: 1,
    });
    expect((await gmSees).ownerId).toBe(ana.state.me.id);
    expect(await emit(ana.socket, "token:move", { id: put.id, x: 2, y: 2 })).toEqual({
      ok: true,
      cost: 2,
    });
    expect(srv.store.tokens[0]).toMatchObject({ moveSpent: 3, diagParity: 0 });
    expect(await emit(ana.socket, "token:move", { id: put.id, x: 10, y: 0 })).toEqual({
      ok: false,
      error: "Fora do mapa.",
    });

    await emit(gm.socket, "token:resetMovement", { sceneId });
    expect(srv.store.tokens[0]).toMatchObject({ moveSpent: 0, diagParity: 0 });

    expect(await emit(ana.socket, "token:update", { id: put.id, color: "#112233" })).toEqual({
      ok: true,
    });
    expect(await emit(ana.socket, "token:update", { id: put.id, hidden: true })).toMatchObject({
      ok: false,
    });
  });

  it("jogador não mexe no token dos outros nem cria NPC", async () => {
    const { gm, ana, sceneId } = await withScene();
    const npc: any = await emit(gm.socket, "token:create", { sceneId, name: "Goblin", x: 1, y: 1 });
    expect(await emit(ana.socket, "token:move", { id: npc.id, x: 2, y: 2 })).toEqual({
      ok: false,
      error: "Esse token não é seu.",
    });
    expect(await emit(ana.socket, "token:delete", { id: npc.id })).toMatchObject({ ok: false });
    expect(await emit(ana.socket, "token:create", { sceneId, name: "Falso", x: 0, y: 0 })).toEqual({
      ok: false,
      error: "Só o mestre cria tokens de NPC.",
    });
  });

  it("apagar o personagem tira o token da cena", async () => {
    const { ana, sceneId } = await withScene();
    const { id: charId }: any = await emit(ana.socket, "character:save", { base: tordek() });
    await emit(ana.socket, "token:create", { sceneId, characterId: charId, x: 0, y: 0 });
    const after = next<SceneView>(ana.socket, "scene:state");
    await emit(ana.socket, "character:delete", { id: charId });
    expect((await after).tokens).toEqual([]);
  });

  it("encolher o grid traz tokens para dentro e zera a névoa", async () => {
    const { gm, sceneId } = await withScene();
    await emit(gm.socket, "token:create", { sceneId, name: "Ogro", x: 8, y: 6, size: 2 });
    await emit(gm.socket, "scene:fog", { sceneId, cells: [1, 2], reveal: true });
    await emit(gm.socket, "scene:update", { id: sceneId, cols: 5, rows: 5 });
    expect(srv.store.tokens[0]).toMatchObject({ x: 3, y: 3 });
    expect((await srv.store.findScene(sceneId))!.revealed).toEqual([]);
  });
});
