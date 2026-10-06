import type { TableState } from "@mesa/protocol";
import { MONSTERS } from "@mesa/srd/monsters";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { useMesa } from "@/lib/store";
import { NO_AMBIENCE } from "@/test/fixtures";
import { EncounterPanel, pickEncounter } from "./EncounterPanel";

const table: TableState = {
  me: { id: "gm", nickname: "Mestre", role: "GM" },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345", startLevel: 3, hpMode: "average" },
  players: [],
  log: [],
  characters: [],
  activeSceneId: "s1",
  scenes: [{ id: "s1", name: "Cripta" }],
  scene: {
    id: "s1",
    name: "Cripta",
    assetId: null,
    gridSize: 70,
    offsetX: 0,
    offsetY: 0,
    cols: 8,
    rows: 8,
    fogEnabled: false,
    revealed: [],
    ...NO_AMBIENCE,
    tokens: [],
  },
  effects: [],
  combat: null,
  activeAudio: null,
  handouts: [],
  abilityRoll: null,
};

describe("pickEncounter", () => {
  it("ND certo para a quantidade e respeita o filtro", () => {
    const plan = pickEncounter(MONSTERS, 5, 4, "", () => 0)!;
    expect(plan.count).toBe(4);
    expect(plan.cr).toBe(1);
    const undead = pickEncounter(MONSTERS, 5, 1, "morto-vivo", () => 0)!;
    expect(undead.cr).toBe(5);
    expect(undead.monster.type).toBe("Undead");
    expect(pickEncounter(MONSTERS, 1, 6, "dragão")).toBeNull();
  });
});

describe("EncounterPanel", { timeout: 20_000 }, () => {
  it("sorteia pelo nível do grupo e põe todos no mapa", async () => {
    useMesa.setState({ table, status: "online" });
    const emitWithAck = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: "x" }));
    render(
      <MesaSocketContext.Provider
        value={{ connected: true, timeout: () => ({ emitWithAck }) } as any}
      >
        <EncounterPanel table={table} />
      </MesaSocketContext.Provider>,
    );
    expect(screen.getByText(/NE alvo/)).toHaveTextContent(
      "Grupo nível 3 (nível inicial) → NE alvo 2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Difícil" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    const roll = screen.getByRole("button", { name: /Sortear encontro/ });
    await waitFor(() => expect(roll).toBeEnabled(), { timeout: 10_000 });
    fireEvent.click(roll);
    expect(screen.getByText(/^2×/)).toBeInTheDocument();
    expect(screen.getByText(/NE \d+ · /)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Pôr no mapa/ })));
    expect(emitWithAck).toHaveBeenCalledTimes(2);
    expect(emitWithAck.mock.calls[0]![0]).toBe("token:create");
    expect(screen.getByRole("status")).toHaveTextContent("no mapa");
  });
});
