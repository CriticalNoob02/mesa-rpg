import { io as connect } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { collectLog, emit, next, startServer } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;
afterEach(() => srv?.close());

/** Mesa com mestre e um jogador conectados. */
async function table(opts: Parameters<typeof startServer>[0] = {}) {
  srv = await startServer(opts);
  const gmSession = await srv.createCampaign("Mesa", "Mestre");
  const playerSession = await srv.join(gmSession.campaignId, "Bruno");
  const gm = await srv.connect(gmSession.token);
  const player = await srv.connect(playerSession.token);
  return { gm, player, campaignId: gmSession.campaignId, gmToken: gmSession.token };
}

describe("handshake", () => {
  it("recusa token inválido", async () => {
    srv = await startServer();
    const socket = connect(srv.url, {
      auth: { token: "x" },
      transports: ["websocket"],
      forceNew: true,
    });
    const err = await new Promise<Error>((r) => socket.once("connect_error", r));
    expect(err.message).toBe("unauthorized");
    socket.disconnect();
  });

  it("recusa sem token", async () => {
    srv = await startServer();
    const socket = connect(srv.url, { transports: ["websocket"], forceNew: true });
    const err = await new Promise<Error>((r) => socket.once("connect_error", r));
    expect(err.message).toBe("unauthorized");
    socket.disconnect();
  });

  it("manda snapshot com papel, campanha, presença e log", async () => {
    const { gm, player } = await table();
    expect(gm.state.me).toMatchObject({ nickname: "Mestre", role: "GM" });
    expect(player.state.me).toMatchObject({ nickname: "Bruno", role: "PLAYER" });
    expect(player.state.campaign).toMatchObject({ name: "Mesa" });
    expect(player.state.players).toEqual([
      expect.objectContaining({ nickname: "Mestre", online: true }),
      expect.objectContaining({ nickname: "Bruno", online: true }),
    ]);
    expect(player.state.log.map((e) => e.kind)).toEqual(["SYSTEM"]);
  });
});

describe("presença", () => {
  it("avisa quando alguém entra e sai", async () => {
    srv = await startServer();
    const s = await srv.createCampaign();
    const p = await srv.join(s.campaignId, "Bruno");
    const gm = await srv.connect(s.token);

    const joined = next(gm.socket, "players");
    const player = await srv.connect(p.token);
    expect((await joined).find((x) => x.nickname === "Bruno")?.online).toBe(true);

    const left = next(gm.socket, "players");
    player.socket.disconnect();
    expect((await left).find((x) => x.nickname === "Bruno")?.online).toBe(false);
  });

  it("duas abas da mesma pessoa contam uma vez", async () => {
    const { gm, campaignId, gmToken } = await table();
    const tab2 = await srv.connect(gmToken);
    tab2.socket.disconnect();
    await new Promise((r) => setTimeout(r, 30));
    const isGmOnline = async () =>
      (await srv.hub.players(campaignId)).find((x) => x.role === "GM")?.online;
    expect(await isGmOnline()).toBe(true);
    gm.socket.disconnect();
    await new Promise((r) => setTimeout(r, 30));
    expect(await isGmOnline()).toBe(false);
  });
});

describe("chat", () => {
  it("entrega a todos e persiste", async () => {
    const { gm, player } = await table();
    const got = next(gm.socket, "log:new");
    expect(await emit(player.socket, "chat:send", { text: "  Olá, mesa!\n" })).toEqual({
      ok: true,
    });
    expect(await got).toMatchObject({
      kind: "CHAT",
      authorName: "Bruno",
      payload: { text: "Olá, mesa!" },
    });
    const again = await srv.connect((await srv.join(player.state.campaign.id, "Caio")).token);
    expect(again.state.log.at(-2)).toMatchObject({ kind: "CHAT" });
  });

  it("recusa mensagem vazia ou longa", async () => {
    const { player } = await table();
    expect(await emit(player.socket, "chat:send", { text: "   " })).toEqual({
      ok: false,
      error: "Mensagem vazia.",
    });
    expect(await emit(player.socket, "chat:send", { text: "x".repeat(1001) })).toMatchObject({
      ok: false,
    });
    expect(await emit(player.socket, "chat:send", {} as any)).toMatchObject({ ok: false });
  });

  it("aguenta evento sem ack", async () => {
    const { gm, player } = await table();
    const got = next(gm.socket, "log:new");
    player.socket.emit("chat:send", { text: "sem ack" }, undefined as any);
    expect((await got).payload).toEqual({ text: "sem ack" });
  });
});

describe("rolagem", () => {
  it("rola no servidor e entrega o detalhe", async () => {
    const { gm, player } = await table({ rng: () => 17 });
    const got = next(gm.socket, "log:new");
    expect(await emit(player.socket, "roll", { expr: "1d20 + 4", label: "Ataque" })).toEqual({
      ok: true,
    });
    expect(await got).toMatchObject({
      kind: "ROLL",
      visibility: "ALL",
      authorName: "Bruno",
      payload: {
        expr: "1d20+4",
        label: "Ataque",
        total: 21,
        terms: [{ rolls: [17] }, { value: 4 }],
      },
    });
  });

  it("ignora resultado mandado pelo cliente", async () => {
    const { gm, player } = await table({ rng: () => 2 });
    const got = next(gm.socket, "log:new");
    await emit(player.socket, "roll", { expr: "1d20", total: 20 } as any);
    expect((await got).payload).toMatchObject({ total: 2 });
  });

  it("devolve erro de expressão", async () => {
    const { player } = await table();
    expect(await emit(player.socket, "roll", { expr: "1d1" })).toEqual({
      ok: false,
      error: "Dado deve ter de 2 a 1000 faces.",
    });
  });

  it("rolagem oculta do jogador chega só ao mestre e a ele", async () => {
    const { gm, player, campaignId, gmToken } = await table();
    const other = await srv.connect((await srv.join(campaignId, "Caio")).token);
    const otherGot = collectLog(other.socket);
    const gmGot = next(gm.socket, "log:new");
    const selfGot = next(player.socket, "log:new");
    await emit(player.socket, "roll", { expr: "1d20", hidden: true });
    expect((await gmGot).visibility).toBe("GM");
    expect((await selfGot).visibility).toBe("GM");
    expect(await otherGot).toEqual([]);

    // E não vaza no snapshot de quem conecta depois.
    const late = await srv.connect((await srv.join(campaignId, "Duda")).token);
    expect(late.state.log.some((e) => e.kind === "ROLL")).toBe(false);
    const gm2 = await srv.connect(gmToken);
    expect(gm2.state.log.some((e) => e.kind === "ROLL")).toBe(true);
  });

  it("rolagem oculta do mestre não chega aos jogadores", async () => {
    const { gm, player } = await table();
    const playerGot = collectLog(player.socket);
    const gmGot = next(gm.socket, "log:new");
    await emit(gm.socket, "roll", { expr: "1d20", hidden: true });
    expect((await gmGot).visibility).toBe("GM");
    expect(await playerGot).toEqual([]);
  });
});

it("limita rajada de ações por participante", async () => {
  const { player } = await table({ socketBurst: 3, socketPerSecond: 0.001 });
  const acks = [];
  for (let i = 0; i < 4; i++) acks.push(await emit(player.socket, "chat:send", { text: `m${i}` }));
  expect(acks.map((a) => a.ok)).toEqual([true, true, true, false]);
});
