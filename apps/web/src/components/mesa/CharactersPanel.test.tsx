import type { TableState } from "@mesa/protocol";
import { emptyCharacter } from "@mesa/rules";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MesaSocketContext } from "@/lib/MesaContext";
import { CharactersPanel } from "./CharactersPanel";

const base = {
  ...emptyCharacter(),
  name: "Tordek",
  raceId: "dwarf",
  levels: [{ classId: "fighter" as const, hp: 10 }],
  abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
  equipment: { armorId: "scale-mail", shieldId: null, weapons: ["waraxe-dwarven"], gear: [] },
  hp: { current: 9, nonlethal: 0, temp: 0 },
};

const table = (withBase: boolean): TableState => ({
  me: { id: "p1", nickname: "Ana", role: "PLAYER" },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345" },
  players: [],
  log: [],
  characters: [
    {
      id: "ch1",
      ownerId: withBase ? "p1" : "p2",
      ownerName: withBase ? "Ana" : "Bruno",
      name: "Tordek",
      raceId: "dwarf",
      classes: [{ classId: "fighter", level: 1 }],
      updatedAt: "2026-10-02T20:00:00.000Z",
      hp: { current: 10, max: 10 },
      ...(withBase ? { base } : {}),
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

const renderPanel = (t: TableState) =>
  render(
    <MesaSocketContext.Provider value={null}>
      <CharactersPanel table={t} />
    </MesaSocketContext.Provider>,
  );

describe("CharactersPanel", () => {
  it("ficha própria mostra os números derivados", () => {
    renderPanel(table(true));
    expect(screen.getByRole("link", { name: "Tordek" })).toHaveAttribute(
      "href",
      "/mesa/c1/personagem/ch1",
    );
    expect(screen.getByText("Anão Guerreiro 1")).toBeInTheDocument();
    expect(screen.getByText("9/13")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument(); // CA 10 + 4 + 1
    expect(screen.getByText("seu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rolar Iniciativa (Tordek)" })).toBeInTheDocument();
  });

  it("ficha de outro jogador mostra só o resumo", () => {
    renderPanel(table(false));
    expect(screen.getByText("Bruno")).toBeInTheDocument();
    expect(screen.queryByText("PV")).toBeNull();
  });

  it("vazio convida a criar", () => {
    renderPanel({ ...table(true), characters: [] });
    expect(screen.getByText("Ninguém criou personagem ainda.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Novo personagem/ })).toHaveAttribute(
      "href",
      "/mesa/c1/personagem/novo",
    );
  });
});
