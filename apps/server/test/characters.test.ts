import { afterEach, describe, expect, it } from "vitest";
import { tordek } from "./fixtures";
import { type Client, collectLog, emit, startServer } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;
afterEach(() => srv?.close());

async function table() {
  srv = await startServer({ rng: () => 4 });
  const gmS = await srv.createCampaign("Mesa", "Mestre");
  const aS = await srv.join(gmS.campaignId, "Ana");
  const bS = await srv.join(gmS.campaignId, "Bruno");
  const gm = await srv.connect(gmS.token);
  const ana = await srv.connect(aS.token);
  const bruno = await srv.connect(bS.token);
  return { gm, ana, bruno, campaignId: gmS.campaignId, tokens: { gm: gmS.token, ana: aS.token } };
}

const once = <T>(socket: Client, event: "character:upsert" | "character:removed") =>
  new Promise<T>((resolve) => (socket.once as any)(event, resolve));

describe("character:save", () => {
  it("cria a ficha: resumo para a mesa, ficha completa para dono e mestre", async () => {
    const { gm, ana, bruno } = await table();
    const atGm = once<any>(gm.socket, "character:upsert");
    const atAna = once<any>(ana.socket, "character:upsert");
    const atBruno = once<any>(bruno.socket, "character:upsert");
    const res = (await emit(ana.socket, "character:save", { base: tordek() } as any)) as any;
    expect(res.ok).toBe(true);
    expect(res.id).toBeTruthy();

    const [g, a, b] = await Promise.all([atGm, atAna, atBruno]);
    expect(b).toMatchObject({
      name: "Tordek",
      ownerName: "Ana",
      raceId: "dwarf",
      classes: [{ classId: "fighter", level: 1 }],
    });
    expect(b.base).toBeUndefined();
    expect(a.base.name).toBe("Tordek");
    expect(g.base.name).toBe("Tordek");
    expect(srv.store.log.at(-1)!.payload).toEqual({ text: "Ana criou Tordek (Anão Guerreiro 1)." });
  });

  it("recusa ficha que quebra a regra, com a lista de problemas", async () => {
    const { ana } = await table();
    const res = (await emit(ana.socket, "character:save", {
      base: tordek({ feats: [{ id: "cleave" }, { id: "toughness" }] }),
    } as any)) as any;
    expect(res).toMatchObject({ ok: false, error: 'Trespassar: falta "Ataque Poderoso".' });
    expect(res.issues[0]).toMatchObject({ path: "feats.0" });
    expect(srv.store.characters).toHaveLength(0);
  });

  it("recusa forma inválida e descarta campos desconhecidos", async () => {
    const { ana } = await table();
    const bad = (await emit(ana.socket, "character:save", { base: { name: "x" } } as any)) as any;
    expect(bad.ok).toBe(false);
    const ok = (await emit(ana.socket, "character:save", {
      base: { ...tordek(), hacker: true },
    } as any)) as any;
    expect(ok.ok).toBe(true);
    expect((srv.store.characters[0]!.base as any).hacker).toBeUndefined();
  });

  it("dono e mestre editam; outro jogador não", async () => {
    const { gm, ana, bruno } = await table();
    const { id } = (await emit(ana.socket, "character:save", { base: tordek() } as any)) as any;
    const renamed = tordek({ name: "Tordek, o Firme" });
    expect(await emit(bruno.socket, "character:save", { id, base: renamed } as any)).toEqual({
      ok: false,
      error: "Só o dono ou o mestre mexem nessa ficha.",
    });
    expect(
      ((await emit(gm.socket, "character:save", { id, base: renamed } as any)) as any).ok,
    ).toBe(true);
    expect(srv.store.characters[0]!.name).toBe("Tordek, o Firme");
    expect(srv.store.characters[0]!.ownerId).not.toBe(gm.state.me.id);
    expect(
      await emit(ana.socket, "character:save", { id: "naoexiste", base: renamed } as any),
    ).toEqual({ ok: false, error: "Personagem não encontrado." });
  });

  it("limita fichas por pessoa", async () => {
    const { ana } = await table();
    for (let i = 0; i < 10; i++)
      srv.store.characters.push({
        ...structuredClone(srv.store.characters[0] ?? {}),
        id: `c${i}`,
        campaignId: ana.state.campaign.id,
        ownerId: ana.state.me.id,
        name: "x",
        base: tordek(),
        updatedAt: new Date(),
      });
    const res = (await emit(ana.socket, "character:save", { base: tordek() } as any)) as any;
    expect(res).toEqual({ ok: false, error: "Máximo de 10 personagens por pessoa." });
  });
});

describe("snapshot e remoção", () => {
  it("snapshot traz as fichas com a visibilidade certa", async () => {
    const { ana, tokens } = await table();
    await emit(ana.socket, "character:save", { base: tordek() } as any);
    const late = await srv.connect((await srv.join(ana.state.campaign.id, "Caio")).token);
    expect(late.state.characters[0]).toMatchObject({ name: "Tordek" });
    expect(late.state.characters[0]!.base).toBeUndefined();
    const gm2 = await srv.connect(tokens.gm);
    expect(gm2.state.characters[0]!.base?.name).toBe("Tordek");
  });

  it("dono remove e todos recebem", async () => {
    const { ana, bruno } = await table();
    const { id } = (await emit(ana.socket, "character:save", { base: tordek() } as any)) as any;
    expect(await emit(bruno.socket, "character:delete", { id } as any)).toMatchObject({
      ok: false,
    });
    const removed = once<any>(bruno.socket, "character:removed");
    expect(await emit(ana.socket, "character:delete", { id } as any)).toEqual({ ok: true });
    expect(await removed).toEqual({ id });
    expect(srv.store.characters).toHaveLength(0);
  });
});

describe("character:rollAbilities", () => {
  it("rola 6× 4d6kh3 no servidor e anuncia no log", async () => {
    const { ana, bruno } = await table();
    const seen = collectLog(bruno.socket);
    const res = (await emit(ana.socket, "character:rollAbilities", {} as any)) as any;
    expect(res).toEqual({ ok: true, scores: [12, 12, 12, 12, 12, 12] });
    expect((await seen)[0]!.payload).toEqual({
      text: "Ana rolou atributos (4d6, descarta o menor): 12, 12, 12, 12, 12, 12.",
    });
  });
});
