"use client";

import type { TableState } from "@mesa/protocol";
import { deriveCharacter } from "@mesa/rules";
import { SRD } from "@mesa/srd";
import { ChevronDown, ChevronUp, Crosshair, ScrollText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { characterEffects } from "@/lib/effects";
import { bestAttackIndex, signed } from "@/lib/srd";
import { hpColor, tokenBadges } from "./geometry";

/** Ficha rápida do meu personagem fixa no canto do mapa. */
export function QuickCard({
  table,
  onSelectToken,
}: {
  table: TableState;
  onSelectToken: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const tokens = table.scene?.tokens ?? [];
  const mine = table.characters.filter((c) => c.ownerId === table.me.id && c.base);
  // Prefere quem está na cena.
  const c = mine.find((x) => tokens.some((t) => t.characterId === x.id)) ?? mine[0];
  const token = c ? tokens.find((t) => t.characterId === c.id) : undefined;
  const d = useMemo(() => {
    if (!c?.base) return null;
    try {
      return deriveCharacter(c.base, characterEffects(table.effects, c.id), SRD);
    } catch {
      return null;
    }
  }, [c, table.effects]);
  if (!c || !d) return null;

  const hp = { current: c.base!.hp.current, max: d.hp.total };
  const atk = d.attacks[bestAttackIndex(d.attacks)];
  const badges = token ? tokenBadges(token, table.effects) : [];

  return (
    <div className="absolute bottom-3 left-3 w-64 max-w-[calc(100%-4.5rem)] rounded-lg border border-line bg-surface/95 p-2.5 text-sm shadow-xl">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!token}
          onClick={() => token && onSelectToken(token.id)}
          title={token ? "Selecionar meu token" : "Sem token nesta cena"}
          className="min-w-0 flex-1 truncate text-left font-display text-base hover:text-accent disabled:hover:text-ink"
        >
          {c.name}
        </button>
        <Link
          href={`/mesa/${table.campaign.id}/personagem/${c.id}`}
          title="Abrir ficha"
          aria-label="Abrir ficha"
          className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        >
          <ScrollText size={14} />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={open ? "Recolher" : "Expandir"}
          aria-label={open ? "Recolher ficha rápida" : "Expandir ficha rápida"}
          className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        >
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg" aria-hidden>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, (hp.current / Math.max(1, hp.max)) * 100))}%`,
              background: hpColor(hp.current, hp.max),
            }}
          />
        </div>
        <span className="font-mono text-xs" title={`Vida ${hp.current} de ${hp.max}`}>
          {hp.current}/{hp.max} PV
        </span>
      </div>
      {open && (
        <>
          <dl className="mt-2 grid grid-cols-3 gap-1 text-center">
            <Mini label="CA" value={String(d.ac.total.total)} />
            <Mini label="Inic." value={signed(d.initiative.total)} />
            <Mini
              label="Fort/Ref/Von"
              value={`${signed(d.saves.fort.total)} ${signed(d.saves.ref.total)} ${signed(d.saves.will.total)}`}
              small
            />
          </dl>
          {atk && (
            <p className="mt-2 flex items-center gap-1.5 text-xs">
              <Crosshair size={12} className="shrink-0 text-muted" />
              <span className="truncate">
                {atk.name}{" "}
                <span className="font-mono">
                  {atk.bonuses.map(signed).join("/")} · {atk.damageDice}
                  {atk.damage.total ? signed(atk.damage.total) : ""}
                </span>
              </span>
            </p>
          )}
          {badges.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-1">
              {[...new Set(badges)].map((b) => (
                <span key={b} className="rounded bg-gm/15 px-1.5 py-0.5 text-[11px] text-gm">
                  {b}
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Mini({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded bg-bg/60 px-1 py-1">
      <dt className="text-[9px] tracking-wide text-faint uppercase">{label}</dt>
      <dd className={small ? "font-mono text-[11px]" : "font-mono text-sm"}>{value}</dd>
    </div>
  );
}
