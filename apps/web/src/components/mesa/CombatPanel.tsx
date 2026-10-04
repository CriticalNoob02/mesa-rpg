"use client";

import type { TableState } from "@mesa/protocol";
import clsx from "clsx";
import { Flag, Hourglass, Play, Plus, SkipForward, Swords, X } from "lucide-react";
import { useState } from "react";
import { roundsLabel } from "@/lib/effects";
import { useMesaAction } from "@/lib/MesaContext";

/** Iniciativa, rodada e turno. Mestre conduz; o dono do combatente da vez encerra o turno. */
export function CombatPanel({ table, bare }: { table: TableState; bare?: boolean }) {
  const send = useMesaAction();
  const [error, setError] = useState<string | null>(null);
  const isGm = table.me.role === "GM";
  const combat = table.combat;
  const scene = table.scene;
  const tokens = new Map((scene?.tokens ?? []).map((t) => [t.id, t]));

  async function run(p: Promise<{ ok: boolean; error?: string }>) {
    const res = await p;
    setError(res.ok ? null : (res.error ?? "Erro."));
  }

  const current = combat?.currentTokenId ? tokens.get(combat.currentTokenId) : undefined;
  const myTurn = !!current && current.ownerId === table.me.id;
  const outside = scene
    ? scene.tokens.filter((t) => !combat?.order.some((o) => o.tokenId === t.id))
    : [];
  const effectsOf = (tokenId: string) => {
    const t = tokens.get(tokenId);
    if (!t) return [];
    return table.effects.filter((e) =>
      t.characterId
        ? e.targetType === "character" && e.targetId === t.characterId
        : e.targetType === "token" && e.targetId === t.id,
    );
  };

  return (
    <div
      className={
        bare ? "text-sm" : "scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm"
      }
    >
      {!combat ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Swords size={22} className="text-faint" />
          <p className="text-muted">Sem combate.</p>
          {isGm && scene && (
            <>
              <button
                type="button"
                onClick={() => run(send("combat:start", { sceneId: scene.id }))}
                className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 font-medium text-accent-ink hover:bg-[#e5b46d]"
              >
                <Play size={14} /> Iniciar combate em {scene.name}
              </button>
              <p className="text-xs text-faint">Rola a iniciativa de todos os tokens da cena.</p>
              <button
                type="button"
                onClick={() => run(send("effects:advanceRound", {}))}
                className="flex items-center gap-1 text-xs text-muted hover:text-ink"
                title="Fora de combate: desconta 1 rodada dos efeitos"
              >
                <Hourglass size={12} /> Passar uma rodada
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p>
              <span className="font-display text-xl">Rodada {combat.round}</span>
              <span className="ml-2 text-muted">
                {current ? `vez de ${current.name}` : "vez do mestre"}
              </span>
            </p>
            {(isGm || myTurn) && (
              <button
                type="button"
                onClick={() => run(send("combat:next", {}))}
                className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-ink hover:bg-[#e5b46d]"
              >
                <SkipForward size={13} /> {myTurn && !isGm ? "Terminar meu turno" : "Próximo turno"}
              </button>
            )}
          </div>

          <ol className="flex flex-col gap-1">
            {combat.order.map((o) => {
              const t = tokens.get(o.tokenId);
              const active = o.tokenId === combat.currentTokenId;
              const fx = effectsOf(o.tokenId);
              return (
                <li
                  key={o.tokenId}
                  aria-current={active ? "step" : undefined}
                  className={clsx(
                    "rounded-md border px-2.5 py-1.5",
                    active ? "border-accent bg-accent/5" : "border-line",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: t?.color ?? "#666" }}
                    />
                    <span className={clsx("min-w-0 flex-1 truncate", active && "font-medium")}>
                      {o.name}
                      {t?.hidden && <span className="ml-1 text-xs text-gm">oculto</span>}
                      {t?.ownerId === table.me.id && (
                        <span className="ml-1 text-xs text-faint">(seu)</span>
                      )}
                    </span>
                    {isGm ? (
                      <input
                        type="number"
                        aria-label={`Iniciativa de ${o.name}`}
                        defaultValue={o.initiative}
                        key={`${o.tokenId}:${o.initiative}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isInteger(v) && v !== o.initiative)
                            run(
                              send("combat:setInitiative", { tokenId: o.tokenId, initiative: v }),
                            );
                        }}
                        className="h-7 w-14 rounded border border-line bg-bg px-1.5 text-right font-mono text-xs focus:border-accent focus:outline-none"
                      />
                    ) : (
                      <span className="font-mono text-xs text-muted">{o.initiative}</span>
                    )}
                    {isGm && (
                      <button
                        type="button"
                        aria-label={`Tirar ${o.name} do combate`}
                        title="Tirar do combate"
                        onClick={() => run(send("combat:remove", { tokenId: o.tokenId }))}
                        className="text-faint hover:text-fumble"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  {fx.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-1 pl-4">
                      {fx.map((e) => (
                        <li key={e.id} className="rounded-full bg-gm/10 px-1.5 text-[10px] text-gm">
                          {e.sourceName}
                          {e.roundsLeft !== null && ` · ${roundsLabel(e.roundsLeft)}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>

          {isGm && outside.length > 0 && combat.sceneId === scene?.id && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-faint">Fora do combate</p>
              <ul className="flex flex-wrap gap-1">
                {outside.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => run(send("combat:add", { tokenId: t.id }))}
                      className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:text-accent"
                    >
                      <Plus size={11} /> {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isGm && (
            <button
              type="button"
              onClick={() => run(send("combat:end", {}))}
              className="mt-4 flex items-center gap-1 text-xs text-muted hover:text-fumble"
            >
              <Flag size={12} /> Encerrar combate
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-fumble">
          {error}
        </p>
      )}
    </div>
  );
}
