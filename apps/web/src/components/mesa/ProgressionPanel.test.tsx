import type { CharacterView, TableState, TokenView } from "@mesa/protocol";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { NO_AMBIENCE } from "@/test/fixtures";
import { ProgressionPanel } from "./ProgressionPanel";

const pc = (
  id: string,
  name: string,
  ownerId: string,
  level: number,
  xp: number,
): CharacterView => ({
  id,
  ownerId,
  ownerName: ownerId === "p1" ? "Ana" : "Bia",
  name,
  raceId: "human",
  classes: [{ classId: "fighter", level }],
  updatedAt: "",
  hp: { current: 10, max: 10 },
  xp,
});

const goblin = (id: string, hp: number): TokenView => ({
  id,
  sceneId: "s1",
  characterId: null,
  ownerId: null,
  name: id === "g1" ? "Goblin" : `Goblin ${id.slice(1)}`,
  x: 0,
  y: 0,
  size: 1,
  color: "#fff",
  hidden: false,
  speed: 30,
  moveSpent: 0,
  diagParity: 0,
  stats: {
    hp,
    hpMax: 5,
    ac: 15,
    touch: 12,
    flatFooted: 14,
    init: 1,
    fort: 3,
    ref: 1,
    will: -1,
    attacks: [],
    cr: "1/3",
  },
});

const table: TableState = {
  me: { id: "gm", nickname: "Mestre", role: "GM" },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345", startLevel: 1, hpMode: "average" },
  players: [
    { id: "gm", nickname: "Mestre", role: "GM", online: true },
    { id: "p1", nickname: "Ana", role: "PLAYER", online: true },
    { id: "p2", nickname: "Bia", role: "PLAYER", online: true },
  ],
  log: [],
  characters: [
    pc("c1", "Tordek", "p1", 1, 900),
    pc("c2", "Lidda", "p2", 1, 1200),
    pc("npc", "Capitão", "gm", 5, 10000),
  ],
  activeSceneId: "s1",
  scenes: [{ id: "s1", name: "Estrada" }],
  scene: {
    id: "s1",
    name: "Estrada",
    assetId: null,
    gridSize: 70,
    offsetX: 0,
    offsetY: 0,
    cols: 6,
    rows: 6,
    fogEnabled: false,
    revealed: [],
    ...NO_AMBIENCE,
    tokens: [goblin("g1", -1), goblin("g2", 0), goblin("g3", 4)],
  },
  effects: [],
  combat: null,
  activeAudio: null,
  handouts: [],
  abilityRoll: null,
};

function setup(t: TableState = table) {
  const emitWithAck = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
  render(
    <MesaSocketContext.Provider
      value={{ connected: true, timeout: () => ({ emitWithAck }) } as any}
    >
      <ProgressionPanel table={t} />
    </MesaSocketContext.Provider>,
  );
  return emitWithAck;
}

describe("ProgressionPanel", () => {
  it("grupo só com fichas de jogador; quem pode subir aparece", () => {
    setup();
    expect(screen.getByText(/nível 1/)).toBeInTheDocument();
    expect(screen.getByText(/2 aventureiros/)).toBeInTheDocument();
    expect(screen.queryByText("Capitão")).toBeNull();
    expect(screen.getByText("subir!")).toBeInTheDocument(); // Lidda tem 1200 XP
  });

  it("XP pelo encontro: só os derrotados, dividido pelo grupo", async () => {
    const emit = setup();
    fireEvent.click(screen.getByRole("button", { name: /Pelo encontro \(2 derrotados\)/ }));
    // 2 goblins ND 1/3 → 200 XP para nível 1, dividido por 2.
    expect(screen.getByLabelText("XP para Tordek")).toHaveValue(100);
    expect(screen.getByLabelText("Motivo do XP")).toHaveValue("Goblin ×2");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Dar XP" })));
    expect(emit).toHaveBeenCalledWith("xp:award", {
      awards: [
        { characterId: "c1", amount: 100 },
        { characterId: "c2", amount: 100 },
      ],
      reason: "Goblin ×2",
    });
  });

  it("XP igual para quem participou", async () => {
    const emit = setup();
    fireEvent.click(screen.getByLabelText("Lidda participou"));
    fireEvent.change(screen.getByLabelText("XP igual para todos"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "para todos" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Dar XP" })));
    expect(emit).toHaveBeenCalledWith("xp:award", {
      awards: [{ characterId: "c1", amount: 250 }],
    });
  });

  it("configura a campanha e libera rolagem", async () => {
    const emit = setup();
    await act(async () =>
      fireEvent.change(screen.getByLabelText("Nível inicial de ficha nova"), {
        target: { value: "3" },
      }),
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Rolado" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Bia" })));
    expect(emit).toHaveBeenCalledWith("campaign:settings", { startLevel: 3 });
    expect(emit).toHaveBeenCalledWith("campaign:settings", { hpMode: "roll" });
    expect(emit).toHaveBeenCalledWith("character:resetRoll", { playerId: "p2" });
    expect(screen.getByRole("status")).toHaveTextContent("Bia pode rolar de novo.");
  });

  it("sem derrotados o botão do encontro fica desligado; sem XP avisa", async () => {
    setup({ ...table, scene: { ...table.scene!, tokens: [] } });
    expect(screen.getByRole("button", { name: /Pelo encontro/ })).toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Dar XP" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Preencha o XP de alguém.");
  });
});
