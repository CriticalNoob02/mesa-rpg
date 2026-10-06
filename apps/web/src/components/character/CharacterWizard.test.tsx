import type { TableState } from "@mesa/protocol";
import { quickCharacter, quickLevelUp } from "@mesa/rules";
import { SRD } from "@mesa/srd";
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

function setup(reply: unknown = { ok: true, id: "ch1" }, characterId?: string) {
  const emitWithAck = vi.fn(async (..._args: unknown[]) => reply);
  const socket = { connected: true, timeout: () => ({ emitWithAck }) };
  render(
    <MesaSocketContext.Provider value={socket as any}>
      <CharacterWizard characterId={characterId} />
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

  it("ficha nova para no nível inicial e PV dos níveis novos não se digitam", async () => {
    useMesa.setState({ table: { ...table, campaign: { ...table.campaign, startLevel: 2 } } });
    setup();
    await step(/Classe/);
    await userEvent.click(screen.getByRole("button", { name: "Escolher" }));
    await userEvent.click(screen.getByRole("button", { name: "Subir de nível" }));
    expect(screen.getByRole("button", { name: "Subir de nível" })).toBeDisabled();
    expect(screen.queryByLabelText("PV do nível 2")).toBeNull();
    expect(screen.getByText(/começa no nível 2/)).toBeInTheDocument();
  });

  it("rolagem única: mostra a rolagem guardada e não rola de novo", async () => {
    useMesa.setState({ table: { ...table, abilityRoll: [16, 9, 14, 12, 11, 13] } });
    setup();
    await step(/Atributos/);
    await userEvent.click(screen.getByRole("button", { name: "Rolagem 4d6" }));
    expect(screen.getByText("16, 9, 14, 12, 11, 13")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rolar/ })).toBeNull();
    expect(screen.getByLabelText("Força")).toHaveValue("16");
  });

  it("rola no servidor uma vez quando ainda não rolou", async () => {
    const { emitWithAck } = setup({ ok: true, scores: [15, 14, 13, 12, 10, 8] });
    await step(/Atributos/);
    await userEvent.click(screen.getByRole("button", { name: "Rolagem 4d6" }));
    await userEvent.click(screen.getByRole("button", { name: /Rolar no servidor/ }));
    expect(emitWithAck).toHaveBeenCalledWith("character:rollAbilities", {});
    expect(screen.getByLabelText("Força")).toHaveValue("15");
  });

  it("jogador editando: raça, atributos e níveis ganhos travados; sobe só até o XP", async () => {
    let base = quickCharacter({ name: "Regdar", raceId: "human", classId: "fighter" }, SRD);
    base = quickLevelUp(base, SRD);
    useMesa.setState({
      table: {
        ...table,
        characters: [
          {
            id: "ch1",
            ownerId: "p1",
            ownerName: "Ana",
            name: "Regdar",
            raceId: "human",
            classes: [{ classId: "fighter", level: 2 }],
            updatedAt: "",
            hp: { current: 10, max: 10 },
            xp: 3000,
            base,
          },
        ],
      },
    });
    setup(undefined, "ch1");
    expect(screen.queryByRole("button", { name: "Remover último nível" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Subir de nível" }));
    expect(screen.getByRole("button", { name: "Subir de nível" })).toBeDisabled(); // XP só dá o 3º
    expect(screen.getByRole("button", { name: "Remover último nível" })).toBeInTheDocument();
    await step(/Atributos/);
    expect(screen.getByText(/Só o mestre muda/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Força")).toBeNull();
    await step(/Raça/);
    expect(screen.getByRole("button", { name: /Anão/ })).toBeDisabled();
  });
});
