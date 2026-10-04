import type { CharacterView, EffectView, SceneView, TokenView } from "@mesa/protocol";
import {
  type Cell,
  deriveCharacter,
  moveBudgets,
  moveCost,
  pick,
  reachable,
  stack,
} from "@mesa/rules";
import { SRD } from "@mesa/srd";

/** Célula sob um ponto do mundo (unidade = px da imagem; célula = gridSize). */
export function cellAt(
  wx: number,
  wy: number,
  scene: Pick<SceneView, "gridSize" | "cols" | "rows">,
): Cell {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  return {
    x: clamp(Math.floor(wx / scene.gridSize), scene.cols),
    y: clamp(Math.floor(wy / scene.gridSize), scene.rows),
  };
}

/** Pincel quadrado de lado `size` (ímpar) centrado na célula. */
export function brushCells(
  center: Cell,
  size: number,
  scene: Pick<SceneView, "cols" | "rows">,
): number[] {
  const r = Math.floor(size / 2);
  const out: number[] = [];
  for (let y = center.y - r; y <= center.y + r; y++) {
    for (let x = center.x - r; x <= center.x + r; x++) {
      if (x >= 0 && y >= 0 && x < scene.cols && y < scene.rows) out.push(y * scene.cols + x);
    }
  }
  return out;
}

/** Deslocamento (pés) e multiplicador de corrida: da ficha, se visível; senão o do token. */
export function tokenMovement(
  token: TokenView,
  characters: CharacterView[],
  effects: EffectView[] = [],
) {
  const c = token.characterId ? characters.find((x) => x.id === token.characterId) : undefined;
  const mine = effects.filter((e) =>
    c
      ? e.targetType === "character" && e.targetId === c.id
      : e.targetType === "token" && e.targetId === token.id,
  );
  if (c?.base) {
    try {
      const active = mine.map((e) => ({ ...e, conditionKey: e.conditionKey ?? undefined }));
      const d = deriveCharacter(c.base, active, SRD);
      return {
        speed: d.speed.total,
        runMultiplier: d.speed.total ? Math.max(0, Math.round(d.speed.run / d.speed.total)) : 4,
      };
    } catch {
      // ficha inválida: usa o token
    }
  }
  // NPC: deslocamento do token + efeitos (mesma conta do servidor).
  const flags = new Set(
    mine.flatMap((e) => SRD.conditions.find((k) => k.key === e.conditionKey)?.flags ?? []),
  );
  const mods = mine.flatMap((e) => e.modifiers.map((m) => ({ ...m, label: e.sourceName })));
  let speed = Math.max(0, token.speed + stack(pick(mods, "speed")).total);
  if (flags.has("halfSpeed")) speed = Math.floor(speed / 10) * 5;
  if (flags.has("noMove")) speed = 0;
  return { speed, runMultiplier: flags.has("noRun") ? 2 : 4 };
}

export type ReachCell = { x: number; y: number; band: "move" | "double" | "run" };

/** Células alcançáveis com o que sobra da rodada, por faixa (movimento, dobro, corrida). */
export function reachBands(
  token: TokenView,
  speed: number,
  runMultiplier: number,
  scene: SceneView,
): ReachCell[] {
  const b = moveBudgets(speed, runMultiplier);
  const left = (n: number) => n - token.moveSpent;
  const all = reachable(token, left(b.run), scene, token.diagParity);
  const out: ReachCell[] = [];
  for (const [key, cost] of all) {
    const [x, y] = key.split(":").map(Number) as [number, number];
    if (x === token.x && y === token.y) continue;
    const band = cost <= left(b.move) ? "move" : cost <= left(b.double) ? "double" : "run";
    // Token grande: só onde cabe inteiro.
    if (x + token.size > scene.cols || y + token.size > scene.rows) continue;
    out.push({ x, y, band });
  }
  return out;
}

export function previewCost(token: TokenView, to: Cell) {
  return moveCost(token, to, token.diagParity).squares;
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Primeira célula livre (varrendo linhas) onde um token `size`×`size` cabe sem sobrepor outro. */
export function firstFreeCell(scene: Pick<SceneView, "cols" | "rows" | "tokens">, size = 1): Cell {
  const taken = new Set<string>();
  for (const t of scene.tokens) {
    for (let dy = 0; dy < t.size; dy++)
      for (let dx = 0; dx < t.size; dx++) taken.add(`${t.x + dx}:${t.y + dy}`);
  }
  const fits = (x: number, y: number) => {
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++) if (taken.has(`${x + dx}:${y + dy}`)) return false;
    return true;
  };
  for (let y = 0; y + size <= scene.rows; y++) {
    for (let x = 0; x + size <= scene.cols; x++) if (fits(x, y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

/** Efeitos que valem para o token (personagem: os da ficha; NPC: os do token). */
export function tokenEffects(token: TokenView, effects: EffectView[]) {
  return effects.filter((e) =>
    token.characterId
      ? e.targetType === "character" && e.targetId === token.characterId
      : e.targetType === "token" && e.targetId === token.id,
  );
}

/** Vida para a barra do token: personagem (todos veem) ou NPC (só o mestre recebe). */
export function tokenHp(
  token: TokenView,
  characters: CharacterView[],
): { current: number; max: number } | null {
  if (token.characterId) return characters.find((c) => c.id === token.characterId)?.hp ?? null;
  return token.stats ? { current: token.stats.hp, max: token.stats.hpMax } : null;
}

/** Nomes curtos dos efeitos para mostrar em cima do token (condição pelo nome em português). */
export function tokenBadges(token: TokenView, effects: EffectView[]): string[] {
  return tokenEffects(token, effects).map(
    (e) => SRD.conditions.find((c) => c.key === e.conditionKey)?.namePt ?? e.sourceName,
  );
}

/** Ataque rápido só entre lados opostos: personagem ataca NPC e NPC ataca personagem. */
export function canQuickAttack(attacker: TokenView, target: TokenView) {
  return attacker.id !== target.id && !attacker.characterId !== !target.characterId;
}

/** Cor da barra de vida pela fração restante. */
export function hpColor(current: number, max: number) {
  const f = max > 0 ? current / max : 0;
  if (f > 0.5) return "#86c98f";
  if (f > 0.25) return "#d9a45b";
  return "#e46d61";
}
