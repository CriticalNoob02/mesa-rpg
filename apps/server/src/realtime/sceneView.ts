import type { CombatView, EffectView, HandoutView, Me, SceneView, TokenView } from "@mesa/protocol";
import type {
  CombatRecord,
  EffectRecord,
  HandoutRecord,
  SceneRecord,
  TokenRecord,
} from "../store/types";

export function tokenView(t: TokenRecord, owners: Map<string, string>): TokenView {
  return { ...t, ownerId: t.characterId ? (owners.get(t.characterId) ?? null) : null };
}

/** Ficha do NPC é do mestre: jogador recebe o token sem `stats`. */
export function forViewer(t: TokenView, viewer: Me): TokenView {
  if (viewer.role === "GM") return t;
  const { stats: _, ...rest } = t;
  return rest;
}

/** Alguma célula ocupada pelo token está sem névoa? */
export function tokenRevealed(
  t: Pick<TokenRecord, "x" | "y" | "size">,
  scene: SceneRecord,
  revealed: Set<number>,
) {
  for (let dy = 0; dy < t.size; dy++) {
    for (let dx = 0; dx < t.size; dx++) {
      if (revealed.has((t.y + dy) * scene.cols + (t.x + dx))) return true;
    }
  }
  return false;
}

/**
 * O que o participante pode ver do token: mestre vê tudo; jogador não vê token
 * oculto nem sob névoa (exceto o próprio personagem).
 */
export function canSeeToken(t: TokenView, scene: SceneRecord, viewer: Me, revealed: Set<number>) {
  if (viewer.role === "GM" || t.ownerId === viewer.id) return true;
  if (t.hidden) return false;
  return !scene.fogEnabled || tokenRevealed(t, scene, revealed);
}

export function sceneViewFor(
  scene: SceneRecord,
  tokens: TokenRecord[],
  owners: Map<string, string>,
  viewer: Me,
): SceneView {
  const revealed = new Set(scene.revealed);
  const { campaignId: _, ...rest } = scene;
  // Narração preparada é segredo do mestre até ele revelar.
  const hideNarration = viewer.role !== "GM" && !scene.narrationRevealed;
  return {
    ...rest,
    ...(hideNarration ? { description: "", ambientAssetId: null } : {}),
    tokens: tokens
      .map((t) => tokenView(t, owners))
      .filter((t) => canSeeToken(t, scene, viewer, revealed))
      .map((t) => forViewer(t, viewer)),
  };
}

/** Efeitos que a pessoa vê: mestre tudo; jogador não vê efeito em token oculto. */
export function effectsFor(
  effects: EffectRecord[],
  hiddenTokenIds: Set<string>,
  viewer: Me,
): EffectView[] {
  return effects
    .filter(
      (e) =>
        viewer.role === "GM" || e.targetType === "character" || !hiddenTokenIds.has(e.targetId),
    )
    .map(({ campaignId: _, ...e }) => e);
}

/** Ordem do combate para a pessoa: jogador não vê combatente oculto. */
export function combatFor(
  combat: CombatRecord | null,
  tokens: Map<string, TokenRecord>,
  viewer: Me,
): CombatView | null {
  if (!combat) return null;
  const visible = (id: string) => {
    const t = tokens.get(id);
    return !!t && (viewer.role === "GM" || !t.hidden);
  };
  const current = combat.order[combat.turnIndex]?.tokenId ?? null;
  return {
    sceneId: combat.sceneId,
    round: combat.round,
    currentTokenId: current && visible(current) ? current : null,
    order: combat.order
      .filter((o) => visible(o.tokenId))
      .map((o) => ({
        tokenId: o.tokenId,
        name: tokens.get(o.tokenId)!.name,
        initiative: o.initiative,
      })),
  };
}

export const handoutSharedWith = (h: Pick<HandoutRecord, "recipients">, playerId: string) =>
  h.recipients === "all" || h.recipients.includes(playerId);

/** Mestre vê todos (com destinatários); jogador só os que recebeu, sem a lista. */
export function handoutsFor(list: HandoutRecord[], viewer: Me): HandoutView[] {
  return list
    .filter((h) => viewer.role === "GM" || handoutSharedWith(h, viewer.id))
    .map((h) => ({
      id: h.id,
      title: h.title,
      text: h.text,
      assetId: h.assetId,
      createdAt: h.createdAt.toISOString(),
      ...(viewer.role === "GM" ? { recipients: h.recipients } : {}),
    }));
}
