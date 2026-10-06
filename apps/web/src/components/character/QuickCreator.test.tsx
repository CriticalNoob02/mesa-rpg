import type { TableState } from "@mesa/protocol";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { useMesa } from "@/lib/store";
import { QuickCreator } from "./QuickCreator";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const table: TableState = {
  me: { id: "p1", nickname: "Ana", role: "PLAYER" },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345", startLevel: 1, hpMode: "average" },
  players: [],
  log: [],
  characters: [],
  activeSceneId: null,
  scenes: [],
  scene: null,
  effects: [],
  combat: null,
  activeAudio: null,
  handouts: [],
  abilityRoll: null,
};

function setup(reply: unknown = { ok: true, id: "ch9" }) {
  const emitWithAck = vi.fn(async (..._args: unknown[]) => reply);
  const socket = { connected: true, timeout: () => ({ emitWithAck }) };
  render(
    <MesaSocketContext.Provider value={socket as any}>
      <QuickCreator />
    </MesaSocketContext.Provider>,
  );
  return emitWithAck;
}

describe("QuickCreator", () => {
  beforeEach(() => {
    push.mockReset();
    useMesa.setState({ table, status: "online" });
  });

  it("cria guerreiro anão com nome, raça e classe e abre a ficha", async () => {
    const emit = setup();
    const create = screen.getByRole("button", { name: /Criar personagem/ });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("Como chamam seu herói?"), "Tordek");
    await userEvent.click(screen.getByRole("button", { name: "Anão" }));
    expect(screen.getByText(/Espada Longa|Machado de Guerra Anão/)).toBeInTheDocument();
    await userEvent.click(create);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/mesa/c1/personagem/ch9"));
    const [event, input] = emit.mock.calls[0]! as [string, any];
    expect(event).toBe("character:save");
    expect(input.base).toMatchObject({
      name: "Tordek",
      raceId: "dwarf",
      levels: [{ classId: "fighter" }],
    });
  });

  it("mago espera as magias e já vem com grimório", async () => {
    const emit = setup();
    await userEvent.type(screen.getByPlaceholderText("Como chamam seu herói?"), "Mialee");
    await userEvent.click(screen.getByRole("button", { name: /Mago/ }));
    await screen.findByText(/Magias:/, undefined, { timeout: 5000 });
    await userEvent.click(screen.getByRole("button", { name: /Criar personagem/ }));
    await waitFor(() => expect(emit).toHaveBeenCalled());
    const input = emit.mock.calls[0]![1] as any;
    expect(input.base.spells.wizard.known.length).toBeGreaterThan(3);
  });

  it("mostra o erro do servidor", async () => {
    setup({ ok: false, error: "Nome repetido." });
    await userEvent.type(screen.getByPlaceholderText("Como chamam seu herói?"), "X");
    await userEvent.click(screen.getByRole("button", { name: /Criar personagem/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nome repetido.");
    expect(push).not.toHaveBeenCalled();
  });
});
