import type { TableState, TokenView } from "@mesa/protocol";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { NO_AMBIENCE } from "@/test/fixtures";
import { TokenPanel } from "./TokenPanel";

const goblin: TokenView = {
  id: "t2",
  sceneId: "s1",
  characterId: null,
  ownerId: null,
  name: "Goblin",
  x: 1,
  y: 1,
  size: 1,
  color: "#e46d61",
  hidden: false,
  speed: 30,
  moveSpent: 0,
  diagParity: 0,
  stats: {
    hp: 5,
    hpMax: 6,
    ac: 15,
    touch: 11,
    flatFooted: 14,
    init: 1,
    fort: 3,
    ref: 1,
    will: -1,
    attacks: [{ name: "Morning star", bonus: 2, damage: "1d8", critical: "x2" }],
  },
};
const rat: TokenView = { ...goblin, id: "t3", name: "Rato", stats: null };

const table: TableState = {
  me: { id: "gm", nickname: "Mestre", role: "GM" },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345" },
  players: [],
  log: [],
  characters: [],
  activeSceneId: "s1",
  scenes: [],
  scene: {
    id: "s1",
    name: "Campo",
    assetId: null,
    gridSize: 70,
    offsetX: 0,
    offsetY: 0,
    cols: 10,
    rows: 10,
    fogEnabled: false,
    revealed: [],
    ...NO_AMBIENCE,
    tokens: [goblin, rat],
  },
  effects: [
    {
      id: "e1",
      targetType: "token",
      targetId: "t2",
      sourceName: "Abalado",
      modifiers: [{ stat: "attack", value: -2, type: "untyped" }],
      conditionKey: "shaken",
      roundsLeft: 2,
      casterTokenId: null,
    },
  ],
  combat: null,
  activeAudio: null,
  handouts: [],
};

function setup(token: TokenView, reply: unknown = { ok: true, hit: true, damage: 7 }) {
  const emitWithAck = vi.fn(async (..._a: unknown[]) => reply);
  const onError = vi.fn();
  render(
    <MesaSocketContext.Provider
      value={{ connected: true, timeout: () => ({ emitWithAck }) } as any}
    >
      <TokenPanel token={token} table={table} onClose={() => {}} onError={onError} />
    </MesaSocketContext.Provider>,
  );
  return { emit: emitWithAck, onError };
}

describe("TokenPanel", () => {
  it("geral: PV do NPC e ajuste", async () => {
    const { emit } = setup(goblin);
    expect(screen.getByText(/PV/)).toHaveTextContent("PV 5/6");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Tirar 1 PV" })));
    expect(emit).toHaveBeenCalledWith("token:stats", {
      id: "t2",
      stats: { ...goblin.stats, hp: 4 },
    });
  });

  it("ataque usa o bônus com efeitos e mostra o resultado", async () => {
    const { emit } = setup(goblin);
    fireEvent.click(screen.getByRole("tab", { name: "Atacar" }));
    expect(
      screen.getByRole("option", { name: /Morning star \(\+0, 1d8, x2\)/ }),
    ).toBeInTheDocument(); // 2 − 2 de Abalado
    fireEvent.change(screen.getByLabelText("Modificador da situação"), { target: { value: "2" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Atacar" })));
    expect(emit).toHaveBeenCalledWith("attack", {
      attackerTokenId: "t2",
      targetTokenId: "t3",
      attackIndex: 0,
      iterative: 0,
      modifier: 2,
      applyDamage: true,
    });
    expect(screen.getByText(/Acertou: 7 de dano/)).toBeInTheDocument();
  });

  it("ataque sem ficha avisa", () => {
    setup(rat);
    fireEvent.click(screen.getByRole("tab", { name: "Atacar" }));
    expect(screen.getByText("Preencha os ataques na aba Ficha.")).toBeInTheDocument();
  });

  it("efeitos: lista, tira e aplica condição com rodadas e quem lançou", async () => {
    const { emit } = setup(goblin, { ok: true, id: "e2" });
    fireEvent.click(screen.getByRole("tab", { name: "Efeitos" }));
    expect(screen.getByRole("button", { name: "Tirar Abalado" })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Tirar Abalado" })));
    expect(emit).toHaveBeenCalledWith("effect:remove", { id: "e1" });

    fireEvent.change(screen.getByLabelText("Efeito"), { target: { value: "cond:prone" } });
    fireEvent.change(screen.getByLabelText("Rodadas"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Quem lançou"), { target: { value: "t3" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Aplicar em Goblin" })),
    );
    expect(emit).toHaveBeenLastCalledWith(
      "effect:apply",
      expect.objectContaining({
        targetType: "token",
        targetId: "t2",
        sourceName: "Caído",
        conditionKey: "prone",
        rounds: 3,
        casterTokenId: "t3",
      }),
    );
  });

  it("efeito personalizado", async () => {
    const { emit } = setup(goblin, { ok: true, id: "e3" });
    fireEvent.click(screen.getByRole("tab", { name: "Efeitos" }));
    fireEvent.change(screen.getByLabelText("Efeito"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Nome do efeito"), { target: { value: "Fúria" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Em"), { target: { value: "str" } });
    fireEvent.change(screen.getByLabelText("Tipo de bônus"), { target: { value: "morale" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Aplicar em Goblin" })),
    );
    expect(emit).toHaveBeenLastCalledWith(
      "effect:apply",
      expect.objectContaining({
        sourceName: "Fúria",
        modifiers: [{ stat: "str", value: 4, type: "morale" }],
        rounds: null,
        casterTokenId: null,
      }),
    );
  });

  it("ficha do NPC salva com ataque novo", async () => {
    const { emit } = setup(rat, { ok: true });
    fireEvent.click(screen.getByRole("tab", { name: "Ficha" }));
    fireEvent.change(screen.getByLabelText("CA"), { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: /ataque/ }));
    fireEvent.change(screen.getByLabelText("Nome do ataque"), { target: { value: "Mordida" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Salvar ficha do NPC" })),
    );
    expect(emit).toHaveBeenCalledWith(
      "token:stats",
      expect.objectContaining({
        id: "t3",
        stats: expect.objectContaining({
          ac: 14,
          attacks: [{ name: "Mordida", bonus: 0, damage: "1d6", critical: "x2" }],
        }),
      }),
    );
    expect(screen.getByRole("button", { name: "Salvo" })).toBeInTheDocument();
  });
});
