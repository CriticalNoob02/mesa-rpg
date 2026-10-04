import type { CombatView, EffectView, TokenView } from "@mesa/protocol";
import { SRD } from "@mesa/srd";
import { afterEach, describe, expect, it } from "vitest";
import { tordek } from "./fixtures";
import { type Client, emit, startServer } from "./helpers";

let srv: Awaited<ReturnType<typeof startServer>>;
afterEach(() => srv?.close());

const next = <T>(socket: Client, event: "combat" | "effects" | "token:update") =>
  new Promise<T>((resolve) => (socket.once as any)(event, resolve));

/**
 * Mesa com cena, Tordek (Ana) e um goblin com ficha. O dado do servidor segue
 * uma fila controlada pelo teste (o resto rola 10).
 */
async function table() {
  const queue: number[] = [];
  srv = await startServer({
    rng: (sides) => (queue.length ? queue.shift()! : Math.min(10, sides)),
  });
  const gmS = await srv.createCampaign("Mesa", "Mestre");
  const anaS = await srv.join(gmS.campaignId, "Ana");
  const gm = await srv.connect(gmS.token);
  const ana = await srv.connect(anaS.token);
  const scene: any = await emit(gm.socket, "scene:create", { name: "Campo", cols: 20, rows: 10 });
  const ch: any = await emit(ana.socket, "character:save", { base: tordek() });
  const tk: any = await emit(ana.socket, "token:create", {
    sceneId: scene.id,
    characterId: ch.id,
    x: 0,
    y: 0,
  });
  const gob: any = await emit(gm.socket, "token:create", {
    sceneId: scene.id,
    name: "Goblin",
    x: 5,
    y: 0,
  });
  await emit(gm.socket, "token:stats", {
    id: gob.id,
    stats: {
      hp: 6,
      hpMax: 6,
      ac: 12,
      touch: 11,
      flatFooted: 11,
      init: 1,
      fort: 3,
      ref: 1,
      will: -1,
      attacks: [{ name: "Morning star", bonus: 2, damage: "1d6", critical: "x2" }],
    },
  });
  return {
    gm,
    ana,
    sceneId: scene.id as string,
    charId: ch.id as string,
    tordekId: tk.id as string,
    goblinId: gob.id as string,
    queue,
  };
}

describe("combate", () => {
  it("rola iniciativa no servidor e ordena; jogador não vê combatente oculto", async () => {
    const t = await table();
    const hidden: any = await emit(t.gm.socket, "token:create", {
      sceneId: t.sceneId,
      name: "Assassino",
      x: 9,
      y: 9,
      hidden: true,
    });
    t.queue.push(15, 3, 12); // ordem de criação: Tordek (+1), Goblin (+1), Assassino (+0)
    const atAna = next<CombatView>(t.ana.socket, "combat");
    const atGm = next<CombatView>(t.gm.socket, "combat");
    expect(await emit(t.gm.socket, "combat:start", { sceneId: t.sceneId })).toEqual({ ok: true });
    const gmView = await atGm;
    expect(gmView.order.map((o) => `${o.name} ${o.initiative}`)).toEqual([
      "Tordek 16",
      "Assassino 12",
      "Goblin 4",
    ]);
    expect(gmView.currentTokenId).toBe(t.tordekId);
    const anaView = await atAna;
    expect(anaView.order.map((o) => o.name)).toEqual(["Tordek", "Goblin"]);
    const publicLog = srv.store.log
      .filter((e) => e.kind === "SYSTEM" && e.visibility === "ALL")
      .map((e) => (e.payload as any).text);
    expect(publicLog).toContain("Combate! Iniciativa: Tordek 16, Goblin 4.");
    expect(publicLog).toContain("Vez de Tordek.");
    expect(hidden.ok).toBe(true);
  });

  it("só o mestre começa; turno passa pelo dono ou mestre; nova rodada", async () => {
    const t = await table();
    expect(await emit(t.ana.socket, "combat:start", { sceneId: t.sceneId })).toMatchObject({
      ok: false,
    });
    t.queue.push(18, 2);
    await emit(t.gm.socket, "combat:start", { sceneId: t.sceneId });
    expect(await emit(t.ana.socket, "combat:next", {})).toEqual({ ok: true }); // vez de Tordek → Goblin
    expect(await emit(t.ana.socket, "combat:next", {})).toEqual({
      ok: false,
      error: "Não é a sua vez.",
    });
    const view = next<CombatView>(t.ana.socket, "combat");
    await emit(t.gm.socket, "combat:next", {});
    expect(await view).toMatchObject({ round: 2, currentTokenId: t.tordekId });
    expect(srv.store.log.some((e) => (e.payload as any).text === "Rodada 2.")).toBe(true);
    expect(await emit(t.gm.socket, "combat:end", {})).toEqual({ ok: true });
    expect(await srv.store.getCombat(t.ana.state.campaign.id)).toBeNull();
  });

  it("movimento: só na sua vez e até o limite; mestre pode forçar", async () => {
    const t = await table();
    t.queue.push(2, 18); // goblin começa
    await emit(t.gm.socket, "combat:start", { sceneId: t.sceneId });
    expect(await emit(t.ana.socket, "token:move", { id: t.tordekId, x: 1, y: 0 })).toEqual({
      ok: false,
      error: "Não é a sua vez.",
    });
    await emit(t.gm.socket, "combat:next", {});
    // Exausto: anda metade (3 m = 2 quadrados) e não corre: limite 4.
    const exhausted = SRD.conditions.find((c) => c.key === "exhausted")!;
    await emit(t.gm.socket, "effect:apply", {
      targetType: "character",
      targetId: t.charId,
      sourceName: "Exausto",
      modifiers: exhausted.modifiers,
      conditionKey: "exhausted",
    });
    expect(await emit(t.ana.socket, "token:move", { id: t.tordekId, x: 3, y: 0 })).toEqual({
      ok: true,
      cost: 3,
    });
    expect(await emit(t.ana.socket, "token:move", { id: t.tordekId, x: 5, y: 0 })).toEqual({
      ok: false,
      error: "Passou do limite do turno: 5 de 4 quadrados.",
    });
    expect(await emit(t.gm.socket, "token:move", { id: t.tordekId, x: 5, y: 1 })).toMatchObject({
      ok: false,
    });
    expect(
      await emit(t.gm.socket, "token:move", { id: t.tordekId, x: 5, y: 1, force: true }),
    ).toEqual({ ok: true, cost: 2 });
  });

  it("movimento zera no início do turno do token", async () => {
    const t = await table();
    t.queue.push(18, 2);
    await emit(t.gm.socket, "combat:start", { sceneId: t.sceneId });
    await emit(t.ana.socket, "token:move", { id: t.tordekId, x: 2, y: 0 });
    await emit(t.gm.socket, "combat:next", {});
    await emit(t.gm.socket, "combat:next", {});
    expect((await srv.store.findToken(t.tordekId))!.moveSpent).toBe(0);
  });

  it("ordem editável, entrada e saída de combatente", async () => {
    const t = await table();
    t.queue.push(18, 2);
    await emit(t.gm.socket, "combat:start", { sceneId: t.sceneId });
    await emit(t.gm.socket, "combat:setInitiative", { tokenId: t.goblinId, initiative: 30 });
    let c = (await srv.store.getCombat(t.ana.state.campaign.id))!;
    expect(c.order.map((o) => o.tokenId)).toEqual([t.goblinId, t.tordekId]);
    expect(c.order[c.turnIndex]!.tokenId).toBe(t.tordekId); // a vez continua com quem estava
    const orc: any = await emit(t.gm.socket, "token:create", {
      sceneId: t.sceneId,
      name: "Orc",
      x: 8,
      y: 8,
    });
    t.queue.push(20);
    await emit(t.gm.socket, "combat:add", { tokenId: orc.id });
    c = (await srv.store.getCombat(t.ana.state.campaign.id))!;
    expect(c.order.map((o) => o.initiative)).toEqual([30, 20, 19]);
    await emit(t.gm.socket, "token:delete", { id: orc.id });
    c = (await srv.store.getCombat(t.ana.state.campaign.id))!;
    expect(c.order).toHaveLength(2);
  });
});

describe("efeitos", () => {
  it("duração conta no início do turno de quem lançou e expira com aviso", async () => {
    const t = await table();
    t.queue.push(18, 2);
    await emit(t.gm.socket, "combat:start", { sceneId: t.sceneId });
    const got = next<EffectView[]>(t.ana.socket, "effects");
    await emit(t.gm.socket, "effect:apply", {
      targetType: "character",
      targetId: t.charId,
      sourceName: "Bênção",
      modifiers: [{ stat: "attack", value: 1, type: "morale" }],
      rounds: 1,
      casterTokenId: t.tordekId,
    });
    expect((await got)[0]).toMatchObject({ sourceName: "Bênção", roundsLeft: 1 });
    await emit(t.gm.socket, "combat:next", {}); // goblin
    expect(srv.store.effects).toHaveLength(1);
    await emit(t.gm.socket, "combat:next", {}); // volta pro Tordek: expira
    expect(srv.store.effects).toHaveLength(0);
    expect(srv.store.log.some((e) => (e.payload as any).text === "Bênção acabou em Tordek.")).toBe(
      true,
    );
  });

  it("sem quem lançou, desconta a cada rodada; fora de combate o mestre passa a rodada", async () => {
    const t = await table();
    await emit(t.gm.socket, "effect:apply", {
      targetType: "token",
      targetId: t.goblinId,
      sourceName: "Abalado",
      modifiers: [],
      conditionKey: "shaken",
      rounds: 2,
    });
    expect(await emit(t.ana.socket, "effects:advanceRound", {})).toMatchObject({ ok: false });
    await emit(t.gm.socket, "effects:advanceRound", {});
    expect(srv.store.effects[0]!.roundsLeft).toBe(1);
    await emit(t.gm.socket, "effects:advanceRound", {});
    expect(srv.store.effects).toHaveLength(0);
  });

  it("efeito em token oculto não chega ao jogador; validação", async () => {
    const t = await table();
    const ghost: any = await emit(t.gm.socket, "token:create", {
      sceneId: t.sceneId,
      name: "Fantasma",
      x: 3,
      y: 3,
      hidden: true,
    });
    const got = next<EffectView[]>(t.ana.socket, "effects");
    await emit(t.gm.socket, "effect:apply", {
      targetType: "token",
      targetId: ghost.id,
      sourceName: "Invisível",
      modifiers: [],
    });
    expect(await got).toEqual([]);
    expect(
      await emit(t.gm.socket, "effect:apply", {
        targetType: "token",
        targetId: ghost.id,
        sourceName: "x",
        modifiers: [{ stat: "voar" as any, value: 1, type: "untyped" }],
      }),
    ).toMatchObject({ ok: false, error: "Atributo de efeito inválido." });
    expect(
      await emit(t.ana.socket, "effect:apply", {
        targetType: "character",
        targetId: t.charId,
        sourceName: "x",
        modifiers: [],
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("ataque e NPC", () => {
  it("jogador ataca o goblin: acerto tira PV, log de ataque, ficha do NPC não vaza", async () => {
    const t = await table();
    const tokenUpdate = next<TokenView>(t.ana.socket, "token:update");
    t.queue.push(15, 6); // d20 15 → acerta CA 12; machado 1d10 = 6
    const res = await emit(t.ana.socket, "attack", {
      attackerTokenId: t.tordekId,
      targetTokenId: t.goblinId,
      attackIndex: 0,
    });
    expect(res).toEqual({ ok: true, hit: true, damage: 6 + 2 }); // For 15 → +2
    expect((await srv.store.findToken(t.goblinId))!.stats!.hp).toBe(-2);
    expect((await tokenUpdate).stats).toBeUndefined();
    const log = srv.store.log.at(-1)!;
    expect(log).toMatchObject({
      kind: "ATTACK",
      visibility: "ALL",
      payload: {
        attackerName: "Tordek",
        targetName: "Goblin",
        weapon: "Waraxe, dwarven",
        applied: true,
      },
    });
  });

  it("goblin ataca o personagem e o dano entra na ficha", async () => {
    const t = await table();
    t.queue.push(19, 4); // 19+2 = 21 contra CA 17 do Tordek; morning star 1d6 = 4
    const res = await emit(t.gm.socket, "attack", {
      attackerTokenId: t.goblinId,
      targetTokenId: t.tordekId,
      attackIndex: 0,
    });
    expect(res).toEqual({ ok: true, hit: true, damage: 4 });
    expect((await srv.store.findCharacter(t.charId))!.base.hp.current).toBe(13 - 4);
  });

  it("efeito muda a CA usada no ataque", async () => {
    const t = await table();
    await emit(t.gm.socket, "effect:apply", {
      targetType: "character",
      targetId: t.charId,
      sourceName: "Escudo da Fé",
      modifiers: [{ stat: "ac", value: 2, type: "deflection" }],
    });
    t.queue.push(15); // 15+2 = 17: acertaria CA 17, erra CA 19
    expect(
      await emit(t.gm.socket, "attack", {
        attackerTokenId: t.goblinId,
        targetTokenId: t.tordekId,
        attackIndex: 0,
      }),
    ).toEqual({ ok: true, hit: false, damage: 0 });
  });

  it("recusas: token alheio, sem vez, alvo sem ficha, ataque inexistente", async () => {
    const t = await table();
    expect(
      await emit(t.ana.socket, "attack", {
        attackerTokenId: t.goblinId,
        targetTokenId: t.tordekId,
        attackIndex: 0,
      }),
    ).toEqual({ ok: false, error: "Esse token não é seu." });
    const rat: any = await emit(t.gm.socket, "token:create", {
      sceneId: t.sceneId,
      name: "Rato",
      x: 2,
      y: 2,
    });
    expect(
      await emit(t.ana.socket, "attack", {
        attackerTokenId: t.tordekId,
        targetTokenId: rat.id,
        attackIndex: 0,
      }),
    ).toEqual({ ok: false, error: "Rato não tem CA (preencha a ficha do NPC)." });
    expect(
      await emit(t.ana.socket, "attack", {
        attackerTokenId: t.tordekId,
        targetTokenId: t.goblinId,
        attackIndex: 5,
      }),
    ).toEqual({ ok: false, error: "Ataque não encontrado na ficha." });
    t.queue.push(2, 18);
    await emit(t.gm.socket, "combat:start", { sceneId: t.sceneId });
    expect(
      await emit(t.ana.socket, "attack", {
        attackerTokenId: t.tordekId,
        targetTokenId: t.goblinId,
        attackIndex: 0,
      }),
    ).toEqual({ ok: false, error: "Não é a sua vez." });
    expect(await emit(t.gm.socket, "token:stats", { id: t.tordekId, stats: null })).toMatchObject({
      ok: false,
    });
    expect(
      await emit(t.gm.socket, "token:stats", {
        id: t.goblinId,
        stats: {
          hp: 1,
          hpMax: 1,
          ac: 10,
          touch: 10,
          flatFooted: 10,
          init: 0,
          fort: 0,
          ref: 0,
          will: 0,
          attacks: [{ name: "x", bonus: 0, damage: "abc", critical: "x2" }],
        },
      }),
    ).toEqual({ ok: false, error: "Dano inválido (ex.: 1d8+2)." });
  });
});
