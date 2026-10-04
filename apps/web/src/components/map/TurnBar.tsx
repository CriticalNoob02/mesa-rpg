"use client";

import type { TableState, TokenView } from "@mesa/protocol";
import { Crosshair, SkipForward, SlidersHorizontal, Swords } from "lucide-react";
import { useEffect, useState } from "react";
import { useMesaAction } from "@/lib/MesaContext";
import { bestAttackIndex, signed } from "@/lib/srd";
import { useAttacks } from "./TokenPanel";

/** Faixa do turno: de quem é a vez e, para quem controla, as ações principais. */
export function TurnBar({
  table,
  current,
  canAct,
  armed,
  onAct,
  onMore,
  onError,
}: {
  table: TableState;
  current: TokenView;
  canAct: boolean;
  armed: boolean;
  onAct: () => void;
  onMore: () => void;
  onError: (e: string | null) => void;
}) {
  const send = useMesaAction();
  const attacks = useAttacks(current, table);
  const attack = attacks[bestAttackIndex(attacks)];
  const mine = current.ownerId === table.me.id;
  const round = table.combat?.round ?? 1;

  async function endTurn() {
    const res = await send("combat:next", {});
    onError(res.ok ? null : res.error);
  }

  return (
    <div className="absolute top-14 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-col items-center gap-1.5">
      <div
        className={
          mine
            ? "flex items-center gap-2 rounded-full border border-accent/70 bg-surface/95 py-1 pr-1 pl-3 shadow-lg"
            : "flex items-center gap-2 rounded-full border border-line bg-surface/95 py-1 pr-1 pl-3 shadow-lg"
        }
      >
        <Swords size={14} className={mine ? "shrink-0 text-accent" : "shrink-0 text-muted"} />
        <span className="truncate text-sm">
          {mine ? (
            <strong className="font-display text-accent">Sua vez</strong>
          ) : (
            <>
              Vez de <strong>{current.name}</strong>
            </>
          )}
          <span className="ml-1.5 text-xs text-faint">R{round}</span>
        </span>
        {canAct && !armed && (
          <button
            type="button"
            onClick={onAct}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-medium text-accent-ink hover:bg-[#e5b46d]"
          >
            <Crosshair size={14} /> Agir
          </button>
        )}
        {canAct && (
          <button
            type="button"
            onClick={endTurn}
            title="Encerrar turno"
            aria-label="Encerrar turno"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-muted hover:text-ink"
          >
            <SkipForward size={14} />
            <span className="hidden sm:inline">Encerrar turno</span>
          </button>
        )}
      </div>
      {armed && (
        <div className="flex items-center gap-2 rounded-lg border border-fumble/50 bg-surface/95 py-1 pr-1 pl-3 text-xs shadow-lg">
          <span className="min-w-0">
            {attack ? (
              <>
                Mova ou toque num alvo para atacar com <strong>{attack.name}</strong>{" "}
                <span className="font-mono">
                  {signed(attack.bonuses[0]!)} · {attack.damage}
                </span>
              </>
            ) : (
              "Sem ataque na ficha: use Mais opções."
            )}
          </span>
          <button
            type="button"
            onClick={onMore}
            title="Mais opções"
            aria-label="Mais opções"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** "Sua vez!" grande por um instante quando o turno chega ao jogador. */
export function TurnSplash({ table }: { table: TableState }) {
  const combat = table.combat;
  const current = table.scene?.tokens.find((t) => t.id === combat?.currentTokenId);
  const mine = !!current && current.ownerId === table.me.id;
  const key = mine && combat ? `${combat.round}:${current.id}` : null;
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    setShown(key);
    const t = setTimeout(() => setShown(null), 2300);
    return () => clearTimeout(t);
  }, [key]);
  if (!shown) return null;
  return (
    <p
      aria-live="assertive"
      className="turn-splash pointer-events-none absolute top-1/2 left-1/2 rounded-2xl border border-accent/60 bg-bg/85 px-8 py-4 font-display text-4xl text-accent shadow-2xl sm:text-5xl"
    >
      Sua vez!
    </p>
  );
}
