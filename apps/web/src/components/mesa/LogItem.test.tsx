import type { LogEntryView } from "@mesa/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LogItem } from "./LogItem";

const base = {
  id: "e1",
  visibility: "ALL" as const,
  authorId: "p1",
  authorName: "Ana",
  createdAt: "2026-10-02T20:00:00.000Z",
};

const roll = (rolls: number[], extra: Partial<LogEntryView> = {}): LogEntryView =>
  ({
    ...base,
    kind: "ROLL",
    payload: {
      expr: "1d20+4",
      label: "Ataque",
      total: rolls[0]! + 4,
      terms: [
        { kind: "dice", sign: 1, count: 1, sides: 20, rolls, kept: [true], subtotal: rolls[0] },
        { kind: "const", sign: 1, value: 4, subtotal: 4 },
      ],
    },
    ...extra,
  }) as LogEntryView;

describe("LogItem", () => {
  it("mostra chat", () => {
    render(<LogItem meId="p2" entry={{ ...base, kind: "CHAT", payload: { text: "olá" } }} />);
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("olá")).toBeInTheDocument();
  });

  it("mostra sistema", () => {
    render(
      <LogItem
        meId="p2"
        entry={{
          ...base,
          authorId: null,
          authorName: null,
          kind: "SYSTEM",
          payload: { text: "Bruno entrou." },
        }}
      />,
    );
    expect(screen.getByText("Bruno entrou.")).toBeInTheDocument();
  });

  it("mostra rolagem com detalhe e total", () => {
    render(<LogItem meId="p1" entry={roll([12])} />);
    expect(screen.getByText("Ataque")).toBeInTheDocument();
    expect(screen.getByTestId("roll-total")).toHaveTextContent("16");
    expect(screen.getByText(/1d20\+4 =/)).toBeInTheDocument();
    expect(screen.queryByText(/natural/)).toBeNull();
  });

  it("destaca 20 e 1 naturais", () => {
    const { unmount } = render(<LogItem meId="p1" entry={roll([20])} />);
    expect(screen.getByText("20 natural")).toBeInTheDocument();
    unmount();
    render(<LogItem meId="p1" entry={roll([1])} />);
    expect(screen.getByText("1 natural")).toBeInTheDocument();
  });

  it("marca oculta e dado descartado", () => {
    const entry = {
      ...base,
      visibility: "GM",
      kind: "ROLL",
      payload: {
        expr: "4d6kh3",
        total: 13,
        terms: [
          {
            kind: "dice",
            sign: 1,
            count: 4,
            sides: 6,
            keep: { mode: "h", n: 3 },
            rolls: [3, 1, 6, 4],
            kept: [true, false, true, true],
            subtotal: 13,
          },
          { kind: "const", sign: -1, value: 1, subtotal: -1 },
        ],
      },
    } as LogEntryView;
    render(<LogItem meId="p1" entry={entry} />);
    expect(screen.getByText("oculta")).toBeInTheDocument();
    expect(screen.getByText("1")).toHaveClass("line-through");
  });
});

describe("LogItem ataque", () => {
  const attack = (over: any = {}): LogEntryView =>
    ({
      ...base,
      kind: "ATTACK",
      payload: {
        attackerName: "Tordek",
        targetName: "Goblin",
        weapon: "Machado",
        applied: true,
        result: {
          attack: { expr: "1d20+3", terms: [], total: 22 },
          natural: 19,
          total: 22,
          hit: true,
          threat: true,
          confirm: {
            roll: { expr: "1d20+3", terms: [], total: 18 },
            natural: 15,
            total: 18,
            confirmed: true,
          },
          critical: true,
          damageRolls: [
            { expr: "1d10+2", terms: [], total: 9 },
            { expr: "1d10+2", terms: [], total: 7 },
            { expr: "1d10+2", terms: [], total: 5 },
          ],
          damage: 21,
          ...over,
        },
      },
    }) as LogEntryView;

  it("mostra crítico confirmado e dano", () => {
    render(<LogItem meId="p1" entry={attack()} />);
    expect(screen.getByText("Crítico!")).toBeInTheDocument();
    expect(screen.getByTestId("attack-damage")).toHaveTextContent("21");
    expect(screen.getByText(/confirmação/).parentElement).toHaveTextContent("✓");
  });

  it("mostra erro sem dano", () => {
    render(
      <LogItem
        meId="p1"
        entry={attack({
          hit: false,
          threat: false,
          confirm: null,
          critical: false,
          damageRolls: [],
          damage: 0,
          natural: 3,
        })}
      />,
    );
    expect(screen.getByText("Errou")).toBeInTheDocument();
    expect(screen.queryByTestId("attack-damage")).toBeNull();
  });
});
