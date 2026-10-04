import type { TableState } from "@mesa/protocol";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { useMesa } from "@/lib/store";
import { CharacterWizard } from "./CharacterWizard";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const table: TableState = {
  me: { id: "p1", nickname: "Ana", role: "PLAYER" },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345" },
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
};

function setup(reply: unknown = { ok: true, id: "ch1" }) {
  const emitWithAck = vi.fn(async (..._args: unknown[]) => reply);
  const socket = { connected: true, timeout: () => ({ emitWithAck }) };
  render(
    <MesaSocketContext.Provider value={socket as any}>
      <CharacterWizard />
    </MesaSocketContext.Provider>,
  );
  return { emitWithAck };
}

const step = (name: RegExp) =>
  userEvent.click(
    within(screen.getByRole("navigation", { name: "Passos" })).getByRole("button", { name }),
  );

describe("CharacterWizard", () => {
  beforeEach(() => {
    push.mockReset();
    useMesa.setState({ table, status: "online" });
  });

  it("cria um guerreiro humano válido e salva com PV cheios", async () => {
    const { emitWithAck } = setup();
    await userEvent.type(screen.getByPlaceholderText("Tordek, filho de Tardek"), "Regdar");
    expect(screen.getByRole("button", { name: /Salvar/ })).toBeDisabled();

    await step(/Classe/);
    await userEvent.click(screen.getByRole("button", { name: "Escolher" }));
    expect(screen.getAllByText("Guerreiro 1").length).toBeGreaterThan(0);

    await step(/Talentos/);
    await userEvent.click(screen.getByRole("button", { name: "Adicionar Vitalidade" }));
    await userEvent.click(screen.getByRole("button", { name: "Adicionar Prontidão" }));
    await userEvent.click(screen.getByRole("button", { name: "Adicionar Lutar às Cegas" }));

    await step(/Revisão/);
    expect(screen.getByText("A ficha segue as regras. Pode salvar.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar ficha" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/mesa/c1/personagem/ch1"));
    const [event, input] = emitWithAck.mock.calls[0]! as [string, any];
    expect(event).toBe("character:save");
    expect(input.base).toMatchObject({
      name: "Regdar",
      raceId: "human",
      levels: [{ classId: "fighter", hp: 10 }],
    });
    expect(input.base.hp.current).toBe(13); // 10 + Vitalidade
    expect(localStorage.getItem("mesa:draft:c1")).toBeNull();
  });

  it("mostra problemas por passo e o erro do servidor", async () => {
    setup({ ok: false, error: "Recusado pelo servidor." });
    const nav = screen.getByRole("navigation", { name: "Passos" });
    // Sem nome e sem classe: contadores de erro nos passos.
    expect(within(nav).getByRole("button", { name: /Raça/ })).toHaveTextContent("1");
    await userEvent.type(screen.getByPlaceholderText("Tordek, filho de Tardek"), "X");
    await step(/Classe/);
    await userEvent.click(screen.getByRole("button", { name: "Escolher" }));
    await step(/Talentos/);
    for (const f of ["Vitalidade", "Prontidão", "Lutar às Cegas"]) {
      await userEvent.click(screen.getByRole("button", { name: `Adicionar ${f}` }));
    }
    await userEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Recusado pelo servidor.");
  });

  it("guarda rascunho e point-buy respeita o orçamento", async () => {
    setup();
    await userEvent.type(screen.getByPlaceholderText("Tordek, filho de Tardek"), "Rascunho");
    expect(JSON.parse(localStorage.getItem("mesa:draft:c1")!).name).toBe("Rascunho");
    await step(/Atributos/);
    expect(screen.getByText("12 de 25 pontos")).toBeInTheDocument();
    for (let i = 0; i < 8; i++)
      await userEvent.click(screen.getByRole("button", { name: "Aumentar Força" }));
    expect(screen.getByRole("button", { name: "Aumentar Força" })).toBeDisabled();
    expect(screen.getByText("26 de 25 pontos")).toHaveClass("text-fumble");
  });
});
