import { afterEach, describe, expect, it, vi } from "vitest";
import { getSession, listSessions, removeSession, saveSession } from "./sessions";

afterEach(() => vi.restoreAllMocks());

describe("sessions", () => {
  it("salva, atualiza e ordena pela mais recente", () => {
    saveSession({ campaignId: "a", token: "t1", lastUsedAt: 1 });
    saveSession({ campaignId: "b", token: "t2", lastUsedAt: 2 });
    saveSession({ campaignId: "a", token: "t1", campaignName: "Mesa A", lastUsedAt: 3 });
    expect(listSessions().map((s) => s.campaignId)).toEqual(["a", "b"]);
    expect(getSession("a")).toMatchObject({ token: "t1", campaignName: "Mesa A" });
  });

  it("remove", () => {
    saveSession({ campaignId: "a", token: "t1" });
    removeSession("a");
    expect(getSession("a")).toBeUndefined();
  });

  it("tolera lixo e storage indisponível", () => {
    localStorage.setItem("mesa:sessions", "{nope");
    expect(listSessions()).toEqual([]);
    localStorage.setItem(
      "mesa:sessions",
      JSON.stringify([{ x: 1 }, { campaignId: "a", token: "t" }]),
    );
    expect(listSessions()).toHaveLength(1);
    localStorage.setItem("mesa:sessions", JSON.stringify({}));
    expect(listSessions()).toEqual([]);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(listSessions()).toEqual([]);
    expect(() => saveSession({ campaignId: "a", token: "t" })).not.toThrow();
  });
});
