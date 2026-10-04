import type { Role } from "@mesa/protocol";

/**
 * Sessões guardadas no navegador: o token é a única "conta" do participante.
 * localStorage pode não existir (aba anônima bloqueada etc.): tudo em try/catch.
 */
export type StoredSession = {
  campaignId: string;
  token: string;
  campaignName?: string;
  role?: Role;
  nickname?: string;
  lastUsedAt: number;
};

const KEY = "mesa:sessions";

export function listSessions(): StoredSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is StoredSession =>
          typeof s?.campaignId === "string" && typeof s?.token === "string",
      )
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
  } catch {
    return [];
  }
}

export function getSession(campaignId: string): StoredSession | undefined {
  return listSessions().find((s) => s.campaignId === campaignId);
}

export function saveSession(session: Omit<StoredSession, "lastUsedAt"> & { lastUsedAt?: number }) {
  const prev = getSession(session.campaignId);
  const next: StoredSession = { ...prev, ...session, lastUsedAt: session.lastUsedAt ?? Date.now() };
  write([next, ...listSessions().filter((s) => s.campaignId !== session.campaignId)]);
}

export function removeSession(campaignId: string) {
  write(listSessions().filter((s) => s.campaignId !== campaignId));
}

function write(list: StoredSession[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // sem storage: a sessão vale só enquanto a aba estiver aberta
  }
}
