import type { SceneView, TableState } from "@mesa/protocol";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { NO_AMBIENCE } from "@/test/fixtures";
import { MapView } from "./MapView";

// O canvas (Konva) não roda no jsdom: um dublê expõe os callbacks.
vi.mock("next/dynamic", () => ({
  default: () =>
    function CanvasStub(props: any) {
      return (
        <div
          data-testid="canvas"
          data-tool={props.tool}
          data-targets={[...props.targets].join(",")}
        >
          <button type="button" onClick={() => props.onSelect("t1")}>
            selecionar
          </button>
          <button type="button" onClick={() => props.onSelect("p1")}>
            selecionar meu
          </button>
          <button type="button" onClick={() => props.onAttack("t1")}>
            atacar goblin
          </button>
          <span data-testid="hp">{JSON.stringify([...props.hp])}</span>
          <button type="button" onClick={() => props.onMove("t1", { x: 3, y: 3 })}>
            mover
          </button>
          <button type="button" onClick={() => props.onFog([1, 2], true)}>
            pintar
          </button>
        </div>
      );
    },
}));

const scene: SceneView = {
  id: "s1",
  name: "Caverna",
  assetId: null,
  gridSize: 70,
  offsetX: 0,
  offsetY: 0,
  cols: 10,
  rows: 8,
  fogEnabled: true,
  revealed: [],
  ...NO_AMBIENCE,
  tokens: [
    {
      id: "t1",
      sceneId: "s1",
      characterId: null,
      ownerId: null,
      name: "Goblin",
      x: 1,
      y: 1,
      size: 1,
      color: "#e46d61",
      hidden: true,
      speed: 30,
      moveSpent: 4,
      diagParity: 0,
    },
  ],
};

const table = (role: "GM" | "PLAYER", s: SceneView | null = scene): TableState => ({
  me: { id: "u1", nickname: "X", role },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345" },
  players: [],
  log: [],
  characters: [],
  activeSceneId: "s1",
  scenes: [{ id: "s1", name: "Caverna" }],
  scene: s,
  effects: [],
  combat: null,
  activeAudio: null,
  handouts: [],
});

function setup(t: TableState, reply: unknown = { ok: true }) {
  const emitWithAck = vi.fn(async (..._a: unknown[]) => reply);
  const socket = { connected: true, timeout: () => ({ emitWithAck }) };
  render(
    <MesaSocketContext.Provider value={socket as any}>
      <MapView table={t} />
    </MesaSocketContext.Provider>,
  );
  return emitWithAck;
}

describe("MapView", () => {
  it("sem cena: mestre é convidado a criar", () => {
    setup(table("GM", null));
    expect(screen.getByText("Crie uma cena na aba Cenas.")).toBeInTheDocument();
  });

  it("sem cena: jogador vê aviso neutro", () => {
    setup(table("PLAYER", null));
    expect(screen.getByText("Nenhuma cena ativa")).toBeInTheDocument();
  });

  it("ferramentas de névoa só para o mestre com névoa ligada", () => {
    setup(table("PLAYER"));
    expect(screen.queryByRole("button", { name: "Revelar névoa" })).toBeNull();
    expect(screen.getByRole("button", { name: "Régua" })).toBeInTheDocument();
  });

  it("mestre: troca ferramenta, pinta névoa, move e edita o token", async () => {
    const emit = setup(table("GM"));
    fireEvent.click(screen.getByRole("button", { name: "Revelar névoa" }));
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-tool", "reveal");
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    await act(async () => fireEvent.click(screen.getByText("pintar")));
    expect(emit).toHaveBeenCalledWith("scene:fog", { sceneId: "s1", cells: [1, 2], reveal: true });

    await act(async () => fireEvent.click(screen.getByText("mover")));
    expect(emit).toHaveBeenCalledWith("token:move", { id: "t1", x: 3, y: 3 });

    fireEvent.click(screen.getByText("selecionar"));
    expect(screen.getByText(/Andou/)).toHaveTextContent(
      "Andou 4 □ (6 m) · desl. 9 m · dobro 18 m · corrida 36 m",
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Mostrar/ })));
    expect(emit).toHaveBeenCalledWith("token:update", { id: "t1", hidden: false });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Zerar movimento de todos" })),
    );
    expect(emit).toHaveBeenCalledWith("token:resetMovement", { sceneId: "s1" });
  });

  it("erro do servidor aparece no mapa", async () => {
    setup(table("GM"), { ok: false, error: "Fora do mapa." });
    await act(async () => fireEvent.click(screen.getByText("mover")));
    expect(screen.getByRole("alert")).toHaveTextContent("Fora do mapa.");
  });
});

describe("MapView narração", () => {
  it("abre sozinha para o jogador quando revelada", () => {
    setup(
      table("PLAYER", {
        ...scene,
        narrationRevealed: true,
        description: "A ponte range sob seus pés.",
      }),
    );
    expect(screen.getByRole("dialog", { name: "Narração: Caverna" })).toHaveTextContent(
      "A ponte range sob seus pés.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar narração" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Narração" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("jogador sem narração revelada não tem botão", () => {
    setup(table("PLAYER"));
    expect(screen.queryByRole("button", { name: "Narração" })).toBeNull();
  });

  it("mestre vê prévia antes de revelar", () => {
    setup(table("GM", { ...scene, description: "Texto secreto." }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Narração" }));
    expect(screen.getByText("Prévia: os jogadores ainda não veem.")).toBeInTheDocument();
  });

  it("ataque em 2 cliques: seleciona o meu token na vez e clica no inimigo", async () => {
    const goblin = { ...scene.tokens[0]!, hidden: false, stats: undefined };
    const mine = {
      ...goblin,
      id: "p1",
      characterId: "ch1",
      ownerId: "u1",
      name: "Lidda",
      x: 3,
    };
    const t: TableState = {
      ...table("PLAYER", { ...scene, tokens: [goblin, mine] }),
      characters: [
        {
          id: "ch1",
          ownerId: "u1",
          ownerName: "X",
          name: "Lidda",
          raceId: "halfling",
          classes: [],
          updatedAt: "",
          hp: { current: 4, max: 8 },
        },
      ],
      combat: {
        sceneId: "s1",
        round: 2,
        currentTokenId: "p1",
        order: [
          { tokenId: "p1", name: "Lidda", initiative: 18 },
          { tokenId: "t1", name: "Goblin", initiative: 5 },
        ],
      },
    };
    const emit = setup(t, { ok: true, hit: true, damage: 7 });
    expect(screen.getAllByText(/Sua vez/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("hp")).toHaveTextContent('[["p1",{"current":4,"max":8}]]');
    expect(screen.getByTestId("canvas").dataset.targets).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Agir" }));
    expect(screen.getByTestId("canvas").dataset.targets).toBe("t1");
    expect(screen.getByText(/Sem ataque na ficha/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByText("atacar goblin")));
    expect(emit).toHaveBeenCalledWith("attack", {
      attackerTokenId: "p1",
      targetTokenId: "t1",
      attackIndex: 0,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Acertou Goblin: 7 de dano!");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Encerrar turno" })));
    expect(emit).toHaveBeenCalledWith("combat:next", {});
  });

  it("fora da vez: só mostra de quem é a vez, sem alvos", () => {
    const goblin = { ...scene.tokens[0]!, hidden: false };
    const t: TableState = {
      ...table("PLAYER", { ...scene, tokens: [goblin] }),
      combat: {
        sceneId: "s1",
        round: 1,
        currentTokenId: "t1",
        order: [{ tokenId: "t1", name: "Goblin", initiative: 5 }],
      },
    };
    setup(t);
    expect(screen.getByText("Goblin", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agir" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Encerrar turno" })).toBeNull();
  });
});
