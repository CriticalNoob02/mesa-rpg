import type { SceneView, TableState } from "@mesa/protocol";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { NO_AMBIENCE } from "@/test/fixtures";
import { PlaceTokens, ScenesPanel } from "./ScenesPanel";

const scene: SceneView = {
  id: "s1",
  name: "Caverna",
  assetId: "a1",
  gridSize: 70,
  offsetX: 0,
  offsetY: 0,
  cols: 20,
  rows: 14,
  fogEnabled: false,
  revealed: [],
  ...NO_AMBIENCE,
  tokens: [],
};

const table: TableState = {
  me: { id: "gm", nickname: "Mestre", role: "GM" },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345" },
  players: [],
  log: [],
  characters: [
    {
      id: "ch1",
      ownerId: "p1",
      ownerName: "Ana",
      name: "Lidda",
      raceId: "halfling",
      classes: [],
      updatedAt: "",
      hp: { current: 10, max: 10 },
    },
  ],
  activeSceneId: "s1",
  scenes: [
    { id: "s1", name: "Caverna" },
    { id: "s2", name: "Taverna" },
  ],
  scene,
  effects: [],
  combat: null,
  activeAudio: null,
  handouts: [],
};

function setup() {
  const emitWithAck = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
  const socket = { connected: true, timeout: () => ({ emitWithAck }) };
  render(
    <MesaSocketContext.Provider value={socket as any}>
      <ScenesPanel table={table} />
      <PlaceTokens table={table} />
    </MesaSocketContext.Provider>,
  );
  return emitWithAck;
}

describe("ScenesPanel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("dois campos do grid seguidos vão juntos num envio só", async () => {
    const emit = setup();
    fireEvent.change(screen.getByLabelText("Deslocar X"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Deslocar Y"), { target: { value: "15" } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("scene:update", {
      id: "s1",
      gridSize: 70,
      offsetX: 20,
      offsetY: 15,
    });
  });

  it("ativar, ver e pôr personagem no mapa", async () => {
    const emit = setup();
    fireEvent.click(screen.getByRole("button", { name: "Ativar Taverna" }));
    fireEvent.click(screen.getByRole("button", { name: "Taverna" }));
    fireEvent.click(screen.getByRole("button", { name: /pôr no mapa/ }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(emit).toHaveBeenCalledWith("scene:activate", { id: "s2" });
    expect(emit).toHaveBeenCalledWith("scene:view", { id: "s2" });
    expect(emit).toHaveBeenCalledWith("token:create", {
      sceneId: "s1",
      characterId: "ch1",
      x: 0,
      y: 0,
    });
  });

  it("ignora número inválido no campo", async () => {
    const emit = setup();
    fireEvent.change(screen.getByLabelText("Quadrado (px)"), { target: { value: "5" } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("ScenesPanel ambientação", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("salva narração e áudio ao sair do campo; revela e toca", async () => {
    const emit = setup();
    const text = screen.getByLabelText("Narração da cena");
    fireEvent.change(text, { target: { value: "A caverna cheira a enxofre." } });
    await act(async () => fireEvent.blur(text));
    expect(emit).toHaveBeenCalledWith("scene:update", {
      id: "s1",
      description: "A caverna cheira a enxofre.",
    });
    const audio = screen.getByLabelText("Link do áudio ambiente");
    fireEvent.change(audio, { target: { value: "https://x/cave.mp3" } });
    await act(async () => fireEvent.blur(audio));
    expect(emit).toHaveBeenCalledWith("scene:update", { id: "s1", audioUrl: "https://x/cave.mp3" });
    expect(screen.getByRole("button", { name: "Revelar narração" })).toBeDisabled(); // sem texto salvo ainda
  });
});
