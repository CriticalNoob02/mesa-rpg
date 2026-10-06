import type { HandoutView, TableState } from "@mesa/protocol";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { HandoutsPanel, readSeen } from "./HandoutsPanel";

const handout = (over: Partial<HandoutView> = {}): HandoutView => ({
  id: "h1",
  title: "Carta selada",
  text: "Encontre-me no moinho.",
  assetId: null,
  createdAt: "2026-10-03T20:00:00.000Z",
  ...over,
});

const table = (role: "GM" | "PLAYER", handouts: HandoutView[]): TableState => ({
  me: { id: role === "GM" ? "gm" : "p1", nickname: "X", role },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345", startLevel: 1, hpMode: "average" },
  players: [
    { id: "gm", nickname: "Mestre", role: "GM", online: true },
    { id: "p1", nickname: "Ana", role: "PLAYER", online: true },
    { id: "p2", nickname: "Bia", role: "PLAYER", online: false },
  ],
  log: [],
  characters: [],
  activeSceneId: null,
  scenes: [],
  scene: null,
  effects: [],
  combat: null,
  activeAudio: null,
  handouts,
  abilityRoll: null,
});

function setup(t: TableState) {
  const emitWithAck = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: "h9" }));
  render(
    <MesaSocketContext.Provider
      value={{ connected: true, timeout: () => ({ emitWithAck }) } as any}
    >
      <HandoutsPanel table={t} />
    </MesaSocketContext.Provider>,
  );
  return emitWithAck;
}

describe("HandoutsPanel", () => {
  it("jogador vê o que recebeu, sem formulário, e marca como visto", () => {
    setup(table("PLAYER", [handout()]));
    expect(screen.getByText("Carta selada")).toBeInTheDocument();
    expect(screen.getByText("Encontre-me no moinho.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Título do handout")).toBeNull();
    expect([...readSeen("c1")]).toEqual(["h1"]);
  });

  it("jogador sem handouts vê aviso", () => {
    setup(table("PLAYER", []));
    expect(screen.getByText("O mestre ainda não te mostrou nada.")).toBeInTheDocument();
  });

  it("mestre cria e escolhe para quem mostrar", async () => {
    const emit = setup(table("GM", []));
    fireEvent.change(screen.getByLabelText("Título do handout"), { target: { value: "Mapa" } });
    fireEvent.change(screen.getByLabelText("Texto do handout"), {
      target: { value: "X marca o local." },
    });
    expect(screen.getByRole("button", { name: /Guardar/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bia" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Mostrar/ })));
    expect(emit).toHaveBeenCalledWith("handout:create", {
      title: "Mapa",
      text: "X marca o local.",
      assetId: null,
      recipients: ["p2"],
    });
  });

  it("mestre muda destinatários e apaga", async () => {
    const emit = setup(table("GM", [handout({ recipients: ["p1"] })]));
    const card = screen.getByText("Carta selada").closest("article")!;
    const bia = [...card.querySelectorAll("button")].find((b) => b.textContent === "Bia")!;
    await act(async () => fireEvent.click(bia));
    expect(emit).toHaveBeenCalledWith("handout:update", { id: "h1", recipients: ["p1", "p2"] });
    const todos = [...card.querySelectorAll("button")].find((b) => b.textContent === "todos")!;
    await act(async () => fireEvent.click(todos));
    expect(emit).toHaveBeenCalledWith("handout:update", { id: "h1", recipients: "all" });
    fireEvent.click(screen.getByRole("button", { name: "Apagar Carta selada" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apagar" })));
    expect(emit).toHaveBeenCalledWith("handout:delete", { id: "h1" });
  });
});
