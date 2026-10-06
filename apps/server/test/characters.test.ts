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
        xp: 0,
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

describe("progressão", () => {
  const twelves = { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 };
  const lines = () => srv.store.log.map((e) => (e.payload as any).text as string);

  it("rolagem de atributos é única até o mestre liberar", async () => {
    const { gm, ana } = await table();
    await emit(ana.socket, "character:rollAbilities", {} as any);
    const again = (await emit(ana.socket, "character:rollAbilities", {} as any)) as any;
    expect(again).toEqual({ ok: true, scores: [12, 12, 12, 12, 12, 12] });
    expect(lines().filter((l) => l?.startsWith("Ana rolou atributos"))).toHaveLength(1);
    expect(
      await emit(ana.socket, "character:resetRoll", { playerId: ana.state.me.id } as any),
    ).toMatchObject({ ok: false });
    const cleared = new Promise((r) => ana.socket.once("abilityRoll", r));
    await emit(gm.socket, "character:resetRoll", { playerId: ana.state.me.id } as any);
    expect(await cleared).toBeNull();
    await emit(ana.socket, "character:rollAbilities", {} as any);
    expect(lines().filter((l) => l?.startsWith("Ana rolou atributos"))).toHaveLength(2);
    const late = await srv.connect((await srv.join(ana.state.campaign.id, "Caio")).token);
    expect(late.state.abilityRoll).toBeNull();
  });

  it("ficha rolada só aceita os valores da rolagem", async () => {
    const { ana } = await table();
    const rolled = tordek({ abilityMethod: "rolled", abilities: twelves, feats: [] });
    expect(await emit(ana.socket, "character:save", { base: rolled } as any)).toEqual({
      ok: false,
      error: "Role os atributos antes de salvar.",
    });
    await emit(ana.socket, "character:rollAbilities", {} as any);
    const cheat = tordek({
      abilityMethod: "rolled",
      abilities: { ...twelves, str: 18 },
      feats: [],
    });
    expect(await emit(ana.socket, "character:save", { base: cheat } as any)).toEqual({
      ok: false,
      error: "Os atributos têm que ser os valores que você rolou.",
    });
    expect(((await emit(ana.socket, "character:save", { base: rolled } as any)) as any).ok).toBe(
      true,
    );
  });

  it("jogador não mexe em atributos, níveis ganhos nem PV pela ficha", async () => {
    const { ana } = await table();
    const { id } = (await emit(ana.socket, "character:save", { base: tordek() } as any)) as any;
    expect(
      await emit(ana.socket, "character:save", {
        id,
        base: tordek({ abilities: { ...tordek().abilities, str: 18 } }),
      } as any),
    ).toEqual({ ok: false, error: "Raça e atributos só o mestre muda depois que a ficha existe." });
    // PV atuais enviados pela ficha são ignorados.
    await emit(ana.socket, "character:save", {
      id,
      base: tordek({ name: "Tordek II", hp: { current: 1, nonlethal: 0, temp: 0 } }),
    } as any);
    expect(srv.store.characters[0]).toMatchObject({ name: "Tordek II" });
    expect(srv.store.characters[0]!.base.hp.current).toBe(13);
  });

  it("subir de nível pede XP; mestre dá XP e o PV do nível novo sai pela média", async () => {
    const { gm, ana } = await table();
    const { id } = (await emit(ana.socket, "character:save", { base: tordek() } as any)) as any;
    expect(srv.store.characters[0]!.xp).toBe(0);
    const two = tordek({ levels: [...tordek().levels, { classId: "fighter", hp: 10 }] });
    expect(await emit(ana.socket, "character:save", { id, base: two } as any)).toEqual({
      ok: false,
      error: "Tordek precisa de 1000 XP para o nível 2 (tem 0).",
    });
    expect(
      await emit(ana.socket, "xp:award", { awards: [{ characterId: id, amount: 1000 }] } as any),
    ).toMatchObject({ ok: false });
    const upsert = once<any>(ana.socket, "character:upsert");
    await emit(gm.socket, "xp:award", {
      awards: [{ characterId: id, amount: 1000 }],
      reason: "Goblins",
    } as any);
    expect((await upsert).xp).toBe(1000);
    expect(lines()).toContain("XP — Goblins: Tordek +1000.");
    expect(lines()).toContain("Pode subir de nível: Tordek (nível 2)!");
    expect(((await emit(ana.socket, "character:save", { id, base: two } as any)) as any).ok).toBe(
      true,
    );
    const c = srv.store.characters[0]!;
    expect(c.base.levels[1]!.hp).toBe(6); // d10: média 6, não o 10 enviado
    expect(c.base.hp.current).toBe(13 + 6 + 3); // Con 16
    expect(lines()).toContain("Tordek subiu para o nível 2 (Anão Guerreiro 2): +9 PV.");
    // Nível já ganho não sai pelo jogador.
    expect(await emit(ana.socket, "character:save", { id, base: tordek() } as any)).toEqual({
      ok: false,
      error: "Só o mestre tira níveis.",
    });
  });

  it("PV rolado no servidor e nível inicial da campanha", async () => {
    const { gm, ana } = await table();
    const campaign = once<any>(ana.socket, "campaign" as any);
    await emit(gm.socket, "campaign:settings", { startLevel: 2, hpMode: "roll" } as any);
    expect(await campaign).toMatchObject({ startLevel: 2, hpMode: "roll" });
    const three = tordek({
      levels: [
        { classId: "fighter", hp: 10 },
        { classId: "fighter", hp: 10 },
        { classId: "fighter", hp: 10 },
      ],
    });
    expect(await emit(ana.socket, "character:save", { base: three } as any)).toEqual({
      ok: false,
      error: "Personagem novo começa no nível 2.",
    });
    const two = tordek({ levels: three.levels.slice(0, 2) });
    expect(((await emit(ana.socket, "character:save", { base: two } as any)) as any).ok).toBe(true);
    const c = srv.store.characters[0]!;
    expect(c.xp).toBe(1000);
    expect(c.base.levels[1]!.hp).toBe(4); // dado do servidor (rng fixo em 4)
    expect(c.base.hp.current).toBe(10 + 3 + 4 + 3);
  });

  it("mestre sobe nível direto e o XP acompanha", async () => {
    const { gm, ana } = await table();
    const { id } = (await emit(ana.socket, "character:save", { base: tordek() } as any)) as any;
    const two = tordek({ levels: [...tordek().levels, { classId: "fighter", hp: 9 }] });
    expect(((await emit(gm.socket, "character:save", { id, base: two } as any)) as any).ok).toBe(
      true,
    );
    expect(srv.store.characters[0]!.xp).toBe(1000);
  });

  it("dano e cura pela ficha vão para o log", async () => {
    const { ana, bruno } = await table();
    const { id } = (await emit(ana.socket, "character:save", { base: tordek() } as any)) as any;
    expect(await emit(bruno.socket, "character:hp", { id, delta: -5 } as any)).toMatchObject({
      ok: false,
    });
    await emit(ana.socket, "character:hp", { id, delta: -5 } as any);
    expect(lines()).toContain("Tordek: perdeu 5 (8/13 PV) — por Ana.");
    await emit(ana.socket, "character:hp", { id, delta: 50, temp: 3 } as any);
    expect(srv.store.characters[0]!.base.hp).toMatchObject({ current: 16, temp: 3 });
    expect(lines()).toContain("Tordek: 3 PV temporários, curou 8 (16/13 PV) — por Ana.");
  });
});
