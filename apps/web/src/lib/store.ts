import type {
  ActiveAudio,
  CampaignView,
  CharacterView,
  CombatView,
  EffectView,
  HandoutView,
  LogEntryView,
  PlayerView,
  SceneSummary,
  SceneView,
  TableState,
  TokenView,
} from "@mesa/protocol";
import { create } from "zustand";

export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "unauthorized";

const MAX_LOG = 500;

/** Junta uma entrada nova no log: ignora repetida (reconexão) e corta o excesso. */
export function appendLog(log: LogEntryView[], entry: LogEntryView): LogEntryView[] {
  if (log.some((e) => e.id === entry.id)) return log;
  const next = [...log, entry];
  return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
}

/** Atualiza ou acrescenta pelo id mantendo a ordem. */
export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = [...list];
  next[i] = item;
  return next;
}

export const upsertCharacter = (list: CharacterView[], c: CharacterView) => upsertById(list, c);

type MesaStore = {
  status: ConnectionStatus;
  table: TableState | null;
  setStatus: (s: ConnectionStatus) => void;
  setState: (s: TableState) => void;
  addLog: (e: LogEntryView) => void;
  setPlayers: (p: PlayerView[]) => void;
  upsertCharacter: (c: CharacterView) => void;
  removeCharacter: (id: string) => void;
  setScenes: (input: {
    scenes: SceneSummary[];
    activeSceneId: string | null;
    activeAudio: ActiveAudio;
  }) => void;
  setHandouts: (handouts: HandoutView[]) => void;
  setScene: (scene: SceneView | null) => void;
  upsertToken: (t: TokenView) => void;
  removeToken: (input: { id: string; sceneId: string }) => void;
  setEffects: (effects: EffectView[]) => void;
  setCombat: (combat: CombatView | null) => void;
  setCampaign: (campaign: CampaignView) => void;
  setAbilityRoll: (scores: number[] | null) => void;
  reset: () => void;
};

export const useMesa = create<MesaStore>((set) => {
  const patch = (fn: (t: TableState) => Partial<TableState>) =>
    set((s) => (s.table ? { table: { ...s.table, ...fn(s.table) } } : s));
  return {
    status: "connecting",
    table: null,
    setStatus: (status) => set({ status }),
    setState: (table) => set({ table, status: "online" }),
    addLog: (entry) => patch((t) => ({ log: appendLog(t.log, entry) })),
    setPlayers: (players) => patch(() => ({ players })),
    upsertCharacter: (c) => patch((t) => ({ characters: upsertCharacter(t.characters, c) })),
    removeCharacter: (id) =>
      patch((t) => ({ characters: t.characters.filter((c) => c.id !== id) })),
    setScenes: ({ scenes, activeSceneId, activeAudio }) =>
      patch(() => ({ scenes, activeSceneId, activeAudio })),
    setHandouts: (handouts) => patch(() => ({ handouts })),
    setScene: (scene) => patch(() => ({ scene })),
    upsertToken: (tok) =>
      patch((t) =>
        t.scene && t.scene.id === tok.sceneId
          ? { scene: { ...t.scene, tokens: upsertById(t.scene.tokens, tok) } }
          : {},
      ),
    removeToken: ({ id, sceneId }) =>
      patch((t) =>
        t.scene && t.scene.id === sceneId
          ? { scene: { ...t.scene, tokens: t.scene.tokens.filter((x) => x.id !== id) } }
          : {},
      ),
    setEffects: (effects) => patch(() => ({ effects })),
    setCombat: (combat) => patch(() => ({ combat })),
    setCampaign: (campaign) => patch(() => ({ campaign })),
    setAbilityRoll: (abilityRoll) => patch(() => ({ abilityRoll })),
    reset: () => set({ status: "connecting", table: null }),
  };
});
