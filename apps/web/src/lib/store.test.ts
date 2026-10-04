import type { LogEntryView, TableState } from "@mesa/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { appendLog, useMesa } from "./store";

const chat = (id: string): LogEntryView => ({
  id,
  kind: "CHAT",
  visibility: "ALL",
  authorId: "p1",
  authorName: "Ana",
  payload: { text: id },
  createdAt: "2026-10-02T20:00:00.000Z",
});

const table: TableState = {
  me: { id: "p1", nickname: "Ana", role: "GM" },
  campaign: { id: "c1", name: "Mesa", inviteCode: "ABCD2345" },
  players: [],
  log: [chat("1")],
  characters: [],
  activeSceneId: null,
  scenes: [],
  scene: null,
  effects: [],
  combat: null,
  activeAudio: null,
  handouts: [],
};

describe("appendLog", () => {
  it("ignora entrada repetida", () => {
    const log = [chat("1")];
    expect(appendLog(log, chat("1"))).toBe(log);
  });

  it("corta em 500", () => {
    const log = Array.from({ length: 500 }, (_, i) => chat(String(i)));
    const next = appendLog(log, chat("new"));
    expect(next).toHaveLength(500);
    expect(next[0]!.id).toBe("1");
    expect(next.at(-1)!.id).toBe("new");
  });
});

describe("useMesa", () => {
  beforeEach(() => useMesa.getState().reset());

  it("aplica snapshot, log e presença", () => {
    const s = useMesa.getState();
    s.addLog(chat("x"));
    expect(useMesa.getState().table).toBeNull();

    s.setState(table);
    expect(useMesa.getState().status).toBe("online");
    s.addLog(chat("2"));
    s.setPlayers([{ id: "p1", nickname: "Ana", role: "GM", online: true }]);
    const t = useMesa.getState().table!;
    expect(t.log.map((e) => e.id)).toEqual(["1", "2"]);
    expect(t.players).toHaveLength(1);

    s.setStatus("reconnecting");
    expect(useMesa.getState().status).toBe("reconnecting");
  });
});

describe("characters", () => {
  const view = (id: string, name = id) => ({
    id,
    ownerId: "p1",
    ownerName: "Ana",
    name,
    raceId: "human",
    classes: [],
    updatedAt: "2026-10-02T20:00:00.000Z",
    hp: { current: 10, max: 10 },
  });

  it("upsert mantém ordem e remove", () => {
    useMesa.getState().setState({ ...table, characters: [view("a"), view("b")] });
    useMesa.getState().upsertCharacter(view("a", "A2"));
    useMesa.getState().upsertCharacter(view("c"));
    expect(useMesa.getState().table!.characters.map((c) => c.name)).toEqual(["A2", "b", "c"]);
    useMesa.getState().removeCharacter("b");
    expect(useMesa.getState().table!.characters.map((c) => c.id)).toEqual(["a", "c"]);
  });
});
