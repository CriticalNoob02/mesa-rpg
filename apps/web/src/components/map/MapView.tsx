"use client";

import type { TableState } from "@mesa/protocol";
import clsx from "clsx";
import { BookOpen, Eye, EyeOff, Hand, Maximize, Minus, Plus, RotateCcw, Ruler } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useMesaAction } from "@/lib/MesaContext";
import { getSession } from "@/lib/sessions";
import { bestAttackIndex } from "@/lib/srd";
import { canQuickAttack, tokenBadges, tokenHp } from "./geometry";
import type { MapTool } from "./MapCanvas";
import { NarrationCard } from "./NarrationCard";
import { QuickCard } from "./QuickCard";
import { attacksOf, TokenPanel } from "./TokenPanel";
import { TurnBar, TurnSplash } from "./TurnBar";

// Konva precisa do canvas do navegador: sem SSR.
const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-faint">Carregando mapa…</p>,
});

export function MapView({ table }: { table: TableState }) {
  const send = useMesaAction();
  const scene = table.scene;
  const isGm = table.me.role === "GM";
  const [tool, setTool] = useState<MapTool>("move");
  const [brush, setBrush] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [zoom, setZoom] = useState({ n: 0, factor: 1 });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; hit: boolean } | null>(null);
  // Ação do turno armada: o painel completo só abre em "Mais opções".
  const [moreOptions, setMoreOptions] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  // Movimento barrado pelo limite do turno: o mestre pode forçar.
  const [forceable, setForceable] = useState<{ id: string; x: number; y: number } | null>(null);
  // Narração: abre sozinha para o jogador quando o mestre revela (ou muda o texto).
  const [narrationOpen, setNarrationOpen] = useState(false);
  const narrationKey = scene?.narrationRevealed
    ? `${scene.id}:${scene.description}:${scene.ambientAssetId}`
    : "";
  useEffect(() => {
    if (narrationKey && !isGm) setNarrationOpen(true);
    if (!narrationKey && !isGm) setNarrationOpen(false);
  }, [narrationKey, isGm]);
  const authToken = getSession(table.campaign.id)?.token ?? "";

  if (!scene) {
    return (
      <div className="tactical-grid flex h-full items-center justify-center">
        <p className="rounded-md bg-bg/80 px-3 py-1.5 text-sm text-faint">
          {isGm ? "Crie uma cena na aba Cenas." : "Nenhuma cena ativa"}
        </p>
      </div>
    );
  }

  const selected = scene.tokens.find((t) => t.id === selectedId) ?? null;
  const hp = new Map(
    scene.tokens.flatMap((t) => {
      const v = tokenHp(t, table.characters);
      return v ? [[t.id, v] as const] : [];
    }),
  );
  const badges = new Map(scene.tokens.map((t) => [t.id, tokenBadges(t, table.effects)]));
  const combat = table.combat?.sceneId === scene.id ? table.combat : null;
  const current = combat?.currentTokenId
    ? (scene.tokens.find((t) => t.id === combat.currentTokenId) ?? null)
    : null;
  const canAct = !!current && (isGm || current.ownerId === table.me.id);
  // Armado: o combatente da vez está selecionado por quem o controla.
  const armed = canAct && selected?.id === current.id ? current : null;
  const targets = new Set(
    armed ? scene.tokens.filter((t) => canQuickAttack(armed, t)).map((t) => t.id) : [],
  );

  function select(id: string | null) {
    setSelectedId(id);
    setMoreOptions(false);
  }

  async function quickAttack(targetId: string) {
    if (!armed) return;
    const target = scene!.tokens.find((t) => t.id === targetId);
    const res = await send("attack", {
      attackerTokenId: armed.id,
      targetTokenId: targetId,
      attackIndex: bestAttackIndex(attacksOf(armed, table)),
    });
    if (!res.ok) return setError(res.error);
    setError(null);
    setToast({
      hit: res.hit,
      text: res.hit
        ? `Acertou ${target?.name ?? "o alvo"}: ${res.damage} de dano!`
        : `Errou ${target?.name ?? "o alvo"}.`,
    });
  }
  const previewing = isGm && scene.id !== table.activeSceneId;

  async function act<T extends { ok: boolean }>(p: Promise<T>) {
    const res = await p;
    if (!res.ok) setError((res as unknown as { error: string }).error);
    else setError(null);
    return res.ok;
  }

  const tools: { key: MapTool; label: string; icon: React.ReactNode; gm?: boolean }[] = [
    { key: "move", label: "Mover", icon: <Hand size={15} /> },
    { key: "ruler", label: "Régua", icon: <Ruler size={15} /> },
    { key: "reveal", label: "Revelar névoa", icon: <Eye size={15} />, gm: true },
    { key: "hide", label: "Esconder com névoa", icon: <EyeOff size={15} />, gm: true },
  ];

  return (
    <div className="relative h-full overflow-hidden bg-[#0f0d0b]">
      <MapCanvas
        scene={scene}
        me={table.me}
        characters={table.characters}
        effects={table.effects}
        authToken={authToken}
        tool={tool}
        brush={brush}
        selectedId={selectedId}
        fitSignal={fitSignal}
        zoom={zoom}
        currentTokenId={table.combat?.sceneId === scene.id ? table.combat.currentTokenId : null}
        hp={hp}
        badges={badges}
        targets={targets}
        onSelect={select}
        onAttack={quickAttack}
        onMove={async (id, to) => {
          const res = await send("token:move", { id, ...to });
          setForceable(
            !res.ok && isGm && res.error.startsWith("Passou do limite") ? { id, ...to } : null,
          );
          setError(res.ok ? null : res.error);
          return res.ok;
        }}
        onFog={(cells, reveal) => act(send("scene:fog", { sceneId: scene.id, cells, reveal }))}
      />

      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface/95 p-1 shadow-lg">
        {tools
          .filter((t) => !t.gm || (isGm && scene.fogEnabled))
          .map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tool === t.key}
              title={t.label}
              aria-label={t.label}
              onClick={() => setTool(t.key)}
              className={clsx(
                "flex size-8 items-center justify-center rounded-md",
                tool === t.key
                  ? "bg-accent text-accent-ink"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {t.icon}
            </button>
          ))}
        {(isGm ? !!(scene.description || scene.ambientAssetId) : scene.narrationRevealed) && (
          <button
            type="button"
            aria-pressed={narrationOpen}
            title={isGm && !scene.narrationRevealed ? "Prévia da narração" : "Narração"}
            aria-label="Narração"
            onClick={() => setNarrationOpen((o) => !o)}
            className={clsx(
              "flex size-8 items-center justify-center rounded-md",
              narrationOpen
                ? "bg-accent text-accent-ink"
                : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <BookOpen size={15} />
          </button>
        )}
        {(tool === "reveal" || tool === "hide") && (
          <span className="flex items-center gap-1 border-l border-line pl-1.5 text-xs text-muted">
            Pincel
            {[1, 3, 5].map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={brush === b}
                onClick={() => setBrush(b)}
                className={clsx(
                  "rounded px-1.5 py-0.5 font-mono",
                  brush === b ? "bg-surface-2 text-ink" : "hover:text-ink",
                )}
              >
                {b}
              </button>
            ))}
          </span>
        )}
        {isGm && (
          <button
            type="button"
            title="Zerar movimento de todos (nova rodada)"
            aria-label="Zerar movimento de todos"
            onClick={() => act(send("token:resetMovement", { sceneId: scene.id }))}
            className="flex size-8 items-center justify-center rounded-md border-l border-line text-muted hover:bg-surface-2 hover:text-ink"
          >
            <RotateCcw size={15} />
          </button>
        )}
      </div>

      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <span className="rounded-md bg-surface/90 px-2.5 py-1 text-xs text-muted">
          {scene.name}
          {previewing && <span className="ml-1.5 text-gm">· só você está vendo</span>}
        </span>
      </div>

      <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg border border-line bg-surface/95 p-1">
        <button
          type="button"
          title="Aproximar"
          aria-label="Aproximar"
          onClick={() => setZoom((z) => ({ n: z.n + 1, factor: 1.25 }))}
          className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          title="Afastar"
          aria-label="Afastar"
          onClick={() => setZoom((z) => ({ n: z.n + 1, factor: 0.8 }))}
          className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          title="Centralizar"
          aria-label="Centralizar mapa"
          onClick={() => setFitSignal((n) => n + 1)}
          className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        >
          <Maximize size={15} />
        </button>
      </div>

      {narrationOpen && (
        <NarrationCard
          scene={scene}
          authToken={authToken}
          preview={isGm && !scene.narrationRevealed}
          onClose={() => setNarrationOpen(false)}
        />
      )}

      {combat && <TurnSplash table={table} />}
      {combat && current && (
        <TurnBar
          table={table}
          current={current}
          canAct={canAct}
          armed={!!armed}
          onAct={() => select(current.id)}
          onMore={() => setMoreOptions(true)}
          onError={setError}
        />
      )}

      {selected && (!armed || moreOptions) ? (
        <TokenPanel
          token={selected}
          table={table}
          onClose={() => select(null)}
          onError={setError}
        />
      ) : (
        !isGm && <QuickCard table={table} onSelectToken={select} />
      )}

      {toast && (
        <p
          role="status"
          className={clsx(
            "absolute top-36 left-1/2 -translate-x-1/2 rounded-lg border bg-surface px-4 py-2 font-display text-lg shadow-xl whitespace-nowrap",
            toast.hit ? "border-crit/60 text-crit" : "border-line text-muted",
          )}
        >
          {toast.text}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="absolute top-36 left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-md border border-fumble/40 bg-surface px-3 py-1.5 text-sm text-fumble"
        >
          {error}
          {forceable && (
            <button
              type="button"
              onClick={async () => {
                const res = await send("token:move", { ...forceable, force: true });
                setForceable(null);
                setError(res.ok ? null : res.error);
              }}
              className="ml-2 rounded border border-fumble/50 px-2 py-0.5 text-xs hover:bg-fumble/10"
            >
              Forçar
            </button>
          )}
        </p>
      )}
    </div>
  );
}
