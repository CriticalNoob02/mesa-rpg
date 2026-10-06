import type { TableState, TokenView } from "@mesa/protocol";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { NO_AMBIENCE } from "@/test/fixtures";
import { CombatPanel } from "./CombatPanel";

const tok = (id: string, name: string, extra: Partial<TokenView> = {}): TokenView => ({
  id,
  sceneId: "s1",
  characterId: null,
  ownerId: null,
  name,
  x: 0,
  y: 0,
  size: 1,
  color: "#fff",
  hidden: false,
  speed: 30,
  moveSpent: 0,
  diagParity: 0,
  ...extra,
});

const base = (role: "GM" | "PLAYER", combat: TableState["combat"]): TableState => ({
  me: { id: "p1", nickname: "Ana", role },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345", startLevel: 1, hpMode: "average" },
  players: [],
  log: [],
  characters: [],
  activeSceneId: "s1",
  scenes: [{ id: "s1", name: "Campo" }],
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
    tokens: [
      tok("t1", "Tordek", { characterId: "ch1", ownerId: "p1" }),
      tok("t2", "Goblin"),
      tok("t3", "Orc"),
    ],
  },
  effects: [
    {
      id: "e1",
      targetType: "character",
      targetId: "ch1",
      sourceName: "Bênção",
      modifiers: [],
      conditionKey: null,
      roundsLeft: 3,
      casterTokenId: null,
    },
  ],
  combat,
  activeAudio: null,
  handouts: [],
  abilityRoll: null,
});

const combat = {
  sceneId: "s1",
  round: 2,
  currentTokenId: "t1",
  order: [
    { tokenId: "t1", name: "Tordek", initiative: 16 },
    { tokenId: "t2", name: "Goblin", initiative: 4 },
  ],
};

function setup(t: TableState) {
  const emitWithAck = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
  render(
    <MesaSocketContext.Provider
      value={{ connected: true, timeout: () => ({ emitWithAck }) } as any}
    >
      <CombatPanel table={t} />
    </MesaSocketContext.Provider>,
  );
  return emitWithAck;
}

describe("CombatPanel", () => {
  it("mestre inicia combate e passa rodada fora de combate", async () => {
    const emit = setup(base("GM", null));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Iniciar combate em Campo/ })),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Passar uma rodada/ })),
    );
    expect(emit).toHaveBeenCalledWith("combat:start", { sceneId: "s1" });
    expect(emit).toHaveBeenCalledWith("effects:advanceRound", {});
  });

  it("jogador sem combate só vê o aviso", () => {
    setup(base("PLAYER", null));
    expect(screen.getByText("Sem combate.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("jogador na própria vez termina o turno; vê efeitos e a ordem", async () => {
    const emit = setup(base("PLAYER", combat));
    expect(screen.getByText("Rodada 2")).toBeInTheDocument();
    expect(screen.getByText("vez de Tordek")).toBeInTheDocument();
    expect(screen.getByText(/Bênção/)).toHaveTextContent("Bênção · 3 rod.");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Terminar meu turno/ })),
    );
    expect(emit).toHaveBeenCalledWith("combat:next", { round: 2, tokenId: "t1" });
    expect(screen.queryByLabelText("Iniciativa de Tordek")).toBeNull();
  });

  it("jogador fora da vez não tem botão de turno", () => {
    setup(base("PLAYER", { ...combat, currentTokenId: "t2" }));
    expect(screen.queryByRole("button", { name: /turno/ })).toBeNull();
  });

  it("vez de combatente oculto aparece como vez do mestre", () => {
    setup(base("PLAYER", { ...combat, currentTokenId: null }));
    expect(screen.getByText("vez do mestre")).toBeInTheDocument();
  });

  it("mestre edita iniciativa, adiciona, tira e encerra", async () => {
    const emit = setup(base("GM", combat));
    const input = screen.getByLabelText("Iniciativa de Goblin");
    fireEvent.change(input, { target: { value: "20" } });
    await act(async () => fireEvent.blur(input));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Orc/ })));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Tirar Goblin do combate" })),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Encerrar combate/ })),
    );
    expect(emit).toHaveBeenCalledWith("combat:setInitiative", { tokenId: "t2", initiative: 20 });
    expect(emit).toHaveBeenCalledWith("combat:add", { tokenId: "t3" });
    expect(emit).toHaveBeenCalledWith("combat:remove", { tokenId: "t2" });
    expect(emit).toHaveBeenCalledWith("combat:end", {});
  });

  it("adiar manda o turno esperado; o último da ordem não adia", async () => {
    const emit = setup(base("PLAYER", combat));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Adiar/ })));
    expect(emit).toHaveBeenCalledWith("combat:delay", { round: 2, tokenId: "t1" });
  });

  it("último da ordem não tem adiar", () => {
    setup(base("GM", { ...combat, currentTokenId: "t2" }));
    expect(screen.queryByRole("button", { name: /Adiar/ })).toBeNull();
  });

  it("mestre vê personagem do grupo sem token e coloca no mapa", async () => {
    const t = base("GM", combat);
    t.players = [
      { id: "gm", nickname: "Mestre", role: "GM", online: true },
      { id: "p2", nickname: "Bia", role: "PLAYER", online: true },
    ];
    t.characters = [
      {
        id: "ch2",
        ownerId: "p2",
        ownerName: "Bia",
        name: "Lidda",
        raceId: "halfling",
        classes: [{ classId: "rogue", level: 1 }],
        updatedAt: "",
        hp: { current: 6, max: 6 },
        xp: 0,
      },
    ];
    const emit = setup(t);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Colocar Lidda no mapa" })),
    );
    expect(emit).toHaveBeenCalledWith(
      "token:create",
      expect.objectContaining({ sceneId: "s1", characterId: "ch2" }),
    );
  });
});
