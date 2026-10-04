import type { TableState } from "@mesa/protocol";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { NO_AMBIENCE } from "@/test/fixtures";
import { MonsterPicker } from "./MonsterPicker";

const table: TableState = {
  me: { id: "gm", nickname: "Mestre", role: "GM" },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345" },
  players: [],
  log: [],
  characters: [],
  activeSceneId: "s1",
  scenes: [{ id: "s1", name: "Caverna" }],
  scene: {
    id: "s1",
    name: "Caverna",
    assetId: null,
    gridSize: 70,
    offsetX: 0,
    offsetY: 0,
    cols: 6,
    rows: 6,
    fogEnabled: false,
    revealed: [],
    ...NO_AMBIENCE,
    tokens: [
      {
        id: "t1",
        sceneId: "s1",
        characterId: null,
        ownerId: null,
        name: "Rato",
        x: 0,
        y: 0,
        size: 1,
        color: "#fff",
        hidden: false,
        speed: 30,
        moveSpent: 0,
        diagParity: 0,
      },
    ],
  },
  effects: [],
  combat: null,
  activeAudio: null,
  handouts: [],
};

function setup(reply: unknown = { ok: true, id: "t2" }) {
  const emitWithAck = vi.fn(async (..._a: unknown[]) => reply);
  const socket = { connected: true, timeout: () => ({ emitWithAck }) };
  render(
    <MesaSocketContext.Provider value={socket as any}>
      <MonsterPicker table={table} />
    </MesaSocketContext.Provider>,
  );
  return emitWithAck;
}

describe("MonsterPicker", { timeout: 20_000 }, () => {
  it("busca em português e põe o monstro na primeira célula livre", async () => {
    const emit = setup();
    fireEvent.change(screen.getByLabelText("Buscar monstro"), { target: { value: "goblin" } });
    const add = await screen.findByRole(
      "button",
      { name: "Pôr Goblin, guerreiro de 1º nível no mapa" },
      { timeout: 5000 },
    );
    fireEvent.click(add);
    await waitFor(() =>
      expect(emit).toHaveBeenCalledWith("token:create", {
        sceneId: "s1",
        monsterId: "goblin-1st-level-warrior",
        hidden: false,
        x: 1,
        y: 0,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("no mapa");
  });

  it("monstro Grande procura espaço 2×2 e pode entrar oculto", async () => {
    const emit = setup();
    fireEvent.change(screen.getByLabelText("Buscar monstro"), { target: { value: "ogro" } });
    fireEvent.click(screen.getByLabelText("entra oculto"));
    const add = await screen.findByRole("button", { name: "Pôr Ogro no mapa" }, { timeout: 5000 });
    fireEvent.click(add);
    await waitFor(() =>
      expect(emit).toHaveBeenCalledWith("token:create", {
        sceneId: "s1",
        monsterId: "ogre",
        hidden: true,
        x: 1,
        y: 0,
      }),
    );
  });

  it("filtra por ND", async () => {
    setup();
    await waitFor(() => expect(screen.queryByText("Carregando bestiário…")).toBeNull(), {
      timeout: 10_000,
    });
    fireEvent.click(screen.getByRole("button", { name: "11+" }));
    expect(screen.queryByRole("button", { name: /Pôr Goblin/ })).toBeNull();
  });
});
