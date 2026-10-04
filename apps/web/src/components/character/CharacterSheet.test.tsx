import type { TableState } from "@mesa/protocol";
import { quickCharacter } from "@mesa/rules";
import { SRD } from "@mesa/srd";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { useMesa } from "@/lib/store";
import { CharacterSheet } from "./CharacterSheet";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const base = quickCharacter({ name: "Regdar", raceId: "human", classId: "fighter" }, SRD);
const table = (role: "GM" | "PLAYER", ownerId = "p1"): TableState => ({
  me: { id: "p1", nickname: "Ana", role },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345" },
  players: [],
  log: [],
  characters: [
    {
      id: "ch1",
      ownerId,
      ownerName: "Ana",
      name: "Regdar",
      raceId: "human",
      classes: [{ classId: "fighter", level: 1 }],
      updatedAt: "",
      hp: { current: base.hp.current, max: base.hp.current },
      ...(ownerId === "p1" || role === "GM" ? { base } : {}),
    },
  ],
  activeSceneId: null,
  scenes: [],
  scene: null,
  effects: [],
  combat: null,
  activeAudio: null,
  handouts: [],
});

function setup(t: TableState) {
  useMesa.setState({ table: t, status: "online" });
  const emitWithAck = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
  const socket = { connected: true, timeout: () => ({ emitWithAck }) };
  render(
    <MesaSocketContext.Provider value={socket as any}>
      <CharacterSheet characterId="ch1" />
    </MesaSocketContext.Provider>,
  );
  return emitWithAck;
}

describe("CharacterSheet", () => {
  beforeEach(() => localStorage.clear());

  it("destaques no topo e dano/cura pela quantidade", async () => {
    const emit = setup(table("PLAYER"));
    const hl = screen.getByRole("region", { name: "Destaques" });
    expect(hl).toHaveTextContent("Espada Longa");
    await userEvent.click(screen.getByRole("button", { name: "Tirar 5 PV" }));
    const input = emit.mock.calls[0]![1] as any;
    expect(input.base.hp.current).toBe(base.hp.current - 5);
  });

  it("seções recolhíveis lembram o estado", async () => {
    setup(table("PLAYER"));
    const skills = screen.getByRole("button", { name: "Perícias" });
    expect(skills).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(skills);
    expect(skills).toHaveAttribute("aria-expanded", "true");
    expect(localStorage.getItem("mesa:section:skills")).toBe("1");
  });

  it("sobe de nível com um clique na classe principal", async () => {
    const emit = setup(table("PLAYER"));
    await userEvent.click(screen.getByRole("button", { name: /Subir de nível/ }));
    expect(screen.getByLabelText("Classe do novo nível")).toHaveValue("fighter");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(emit).toHaveBeenCalled());
    const input = emit.mock.calls[0]![1] as any;
    expect(input.base.levels).toHaveLength(2);
    expect(input.base.hp.current).toBeGreaterThan(base.hp.current);
    expect(await screen.findByRole("status")).toHaveTextContent("nível 2");
  });

  it("ficha de outro jogador: sem botões de editar", () => {
    setup(table("PLAYER", "p2"));
    expect(screen.queryByRole("button", { name: /Subir de nível/ })).toBeNull();
    expect(screen.getByText("Só o dono e o mestre veem a ficha completa.")).toBeInTheDocument();
  });
});
