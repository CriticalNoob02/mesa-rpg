import type { HandoutView, SceneView } from "@mesa/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { type Client, emit, startServer } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;
afterEach(() => srv?.close());

function png(width: number, height: number) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const next = <T>(socket: Client, event: "scene:state" | "scenes" | "handouts") =>
  new Promise<T>((resolve) => (socket.once as any)(event, resolve));

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
  const biaS = await srv.join(gmS.campaignId, "Bia");
  const gm = await srv.connect(gmS.token);
  const ana = await srv.connect(anaS.token);
  const bia = await srv.connect(biaS.token);
  const scene: any = await emit(gm.socket, "scene:create", { name: "Taverna" });
  const upload = async () =>
    (
      await srv
        .api()
        .post("/api/assets")
        .set("authorization", `Bearer ${gmS.token}`)
        .set("content-type", "image/png")
        .send(png(100, 80))
        .expect(201)
    ).body.id as string;
  const download = (id: string, token: string) =>
    srv.api().get(`/api/assets/${id}`).set("authorization", `Bearer ${token}`);
  return {
    gm,
    ana,
    bia,
    sceneId: scene.id as string,
    upload,
    download,
    tokens: { gm: gmS.token, ana: anaS.token, bia: biaS.token },
  };
}

describe("narração", () => {
  it("texto e imagem de ambiente ficam com o mestre até revelar", async () => {
    const t = await table();
    const asset = await t.upload();
    const atAna = next<SceneView>(t.ana.socket, "scene:state");
    const atGm = next<SceneView>(t.gm.socket, "scene:state");
    await emit(t.gm.socket, "scene:update", {
      id: t.sceneId,
      description: "A lareira crepita.",
      ambientAssetId: asset,
    });
    expect(await atAna).toMatchObject({
      description: "",
      ambientAssetId: null,
      narrationRevealed: false,
    });
    expect(await atGm).toMatchObject({ description: "A lareira crepita.", ambientAssetId: asset });
    await t.download(asset, t.tokens.ana).expect(404);

    const revealed = next<SceneView>(t.ana.socket, "scene:state");
    await emit(t.gm.socket, "scene:update", { id: t.sceneId, narrationRevealed: true });
    expect(await revealed).toMatchObject({
      description: "A lareira crepita.",
      ambientAssetId: asset,
      narrationRevealed: true,
    });
    await t.download(asset, t.tokens.ana).expect(200);
    expect(srv.store.log.some((e) => (e.payload as any).text === "O mestre narra: Taverna.")).toBe(
      true,
    );
  });

  it("jogador não altera a narração; texto tem limite", async () => {
    const t = await table();
    expect(
      await emit(t.ana.socket, "scene:update", { id: t.sceneId, narrationRevealed: true }),
    ).toMatchObject({ ok: false });
    expect(
      await emit(t.gm.socket, "scene:update", { id: t.sceneId, description: "x".repeat(4001) }),
    ).toMatchObject({ ok: false });
  });
});

describe("áudio", () => {
  it("link do áudio e play chegam a todos pela cena ativa", async () => {
    const t = await table();
    // Outra socket pode ainda entregar a lista da criação da cena: espera a que traz áudio.
    const list = new Promise<any>((resolve) => {
      const fn = (x: any) => {
        if (x.activeAudio) {
          t.ana.socket.off("scenes", fn);
          resolve(x);
        }
      };
      t.ana.socket.on("scenes", fn);
    });
    await emit(t.gm.socket, "scene:update", {
      id: t.sceneId,
      audioUrl: "https://exemplo.com/taverna.mp3",
      audioPlaying: true,
    });
    expect((await list).activeAudio).toEqual({
      url: "https://exemplo.com/taverna.mp3",
      playing: true,
    });

    // Mestre olhando outra cena não muda o áudio de ninguém.
    const other: any = await emit(t.gm.socket, "scene:create", { name: "Floresta" });
    await emit(t.gm.socket, "scene:update", {
      id: other.id,
      audioUrl: "https://exemplo.com/floresta.mp3",
      audioPlaying: true,
    });
    const late = await srv.connect(t.tokens.bia);
    expect(late.state.activeAudio?.url).toBe("https://exemplo.com/taverna.mp3");
  });

  it("recusa link que não é http(s)", async () => {
    const t = await table();
    expect(
      await emit(t.gm.socket, "scene:update", { id: t.sceneId, audioUrl: "javascript:alert(1)" }),
    ).toMatchObject({ ok: false });
    expect(
      await emit(t.gm.socket, "scene:update", { id: t.sceneId, audioUrl: "nao é link" }),
    ).toEqual({ ok: false, error: "Link de áudio inválido." });
  });
});

describe("handouts", () => {
  it("só quem recebeu vê o handout e a imagem dele", async () => {
    const t = await table();
    const asset = await t.upload();
    const anaGot = next<HandoutView[]>(t.ana.socket, "handouts");
    const biaGot = next<HandoutView[]>(t.bia.socket, "handouts");
    const gmGot = next<HandoutView[]>(t.gm.socket, "handouts");
    const res: any = await emit(t.gm.socket, "handout:create", {
      title: "Carta selada",
      text: "Encontre-me no moinho.",
      assetId: asset,
      recipients: [t.ana.state.me.id],
    });
    expect(res.ok).toBe(true);
    expect((await anaGot)[0]).toEqual(
      expect.objectContaining({ title: "Carta selada", assetId: asset }),
    );
    expect((await anaGot)[0]!.recipients).toBeUndefined();
    expect(await biaGot).toEqual([]);
    expect((await gmGot)[0]!.recipients).toEqual([t.ana.state.me.id]);
    await t.download(asset, t.tokens.ana).expect(200);
    await t.download(asset, t.tokens.bia).expect(404);
    const gmOnly = srv.store.log.at(-1)!;
    expect(gmOnly).toMatchObject({
      visibility: "GM",
      payload: { text: 'Handout "Carta selada" mostrado para Ana.' },
    });

    // Mostrar para todos depois avisa no log público.
    const biaNow = next<HandoutView[]>(t.bia.socket, "handouts");
    await emit(t.gm.socket, "handout:update", { id: res.id, recipients: "all" });
    expect((await biaNow).map((h) => h.title)).toEqual(["Carta selada"]);
    expect(srv.store.log.at(-1)).toMatchObject({
      visibility: "ALL",
      payload: { text: 'O mestre mostrou "Carta selada" para todos.' },
    });
  });

  it("handout preparado sem destinatário fica só com o mestre", async () => {
    const t = await table();
    const anaGot = collect<HandoutView[]>(t.ana.socket, "handouts");
    await emit(t.gm.socket, "handout:create", {
      title: "Mapa do tesouro",
      text: "X marca o local.",
      recipients: [],
    });
    expect((await anaGot).flat()).toEqual([]);
    const late = await srv.connect(t.tokens.ana);
    expect(late.state.handouts).toEqual([]);
  });

  it("apagar remove a imagem se ninguém mais usa", async () => {
    const t = await table();
    const asset = await t.upload();
    const res: any = await emit(t.gm.socket, "handout:create", {
      title: "Retrato",
      assetId: asset,
      recipients: "all",
    });
    await emit(t.gm.socket, "handout:delete", { id: res.id });
    expect(srv.store.assets).toHaveLength(0);
    expect(srv.store.handouts).toHaveLength(0);
  });

  it("validações e permissões", async () => {
    const t = await table();
    expect(
      await emit(t.ana.socket, "handout:create", { title: "x", text: "y", recipients: "all" }),
    ).toEqual({ ok: false, error: "Só o mestre faz isso." });
    expect(
      await emit(t.gm.socket, "handout:create", { title: "Vazio", recipients: "all" }),
    ).toEqual({ ok: false, error: "Escreva um texto ou envie uma imagem." });
    expect(
      await emit(t.gm.socket, "handout:create", {
        title: "x",
        text: "y",
        recipients: [t.gm.state.me.id],
      }),
    ).toEqual({ ok: false, error: "Destinatário não está na mesa." });
    expect(await emit(t.gm.socket, "handout:update", { id: "nada", title: "x" })).toEqual({
      ok: false,
      error: "Handout não encontrado.",
    });
  });
});
