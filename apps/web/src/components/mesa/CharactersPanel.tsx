"use client";

import type { CharacterView, EffectView, TableState } from "@mesa/protocol";
import { deriveCharacter } from "@mesa/rules";
import { SRD } from "@mesa/srd";
import { MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { firstFreeCell } from "@/components/map/geometry";
import { characterEffects, roundsLabel } from "@/lib/effects";
import { useMesaAction } from "@/lib/MesaContext";
import { characterSummary, meters, signed } from "@/lib/srd";
import { RollButton } from "./RollButton";

export function CharactersPanel({ table }: { table: TableState }) {
  const base = `/mesa/${table.campaign.id}/personagem`;
  const mine = table.characters.filter((c) => c.ownerId === table.me.id);
  const others = table.characters.filter((c) => c.ownerId !== table.me.id);

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Link
        href={`${base}/novo`}
        className="mb-4 flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-line text-sm text-muted hover:border-accent hover:text-accent"
      >
        <Plus size={15} /> Novo personagem
      </Link>
      {table.characters.length === 0 && (
        <p className="py-6 text-center text-sm text-faint">Ninguém criou personagem ainda.</p>
      )}
      <ul className="flex flex-col gap-2">
        {[...mine, ...others].map((c) => (
          <li key={c.id}>
            <CharacterCard
              character={c}
              href={`${base}/${c.id}`}
              mine={c.ownerId === table.me.id}
              canPlace={
                !!table.scene &&
                table.scene.id === table.activeSceneId &&
                (c.ownerId === table.me.id || table.me.role === "GM") &&
                !table.scene.tokens.some((t) => t.characterId === c.id)
              }
              sceneId={table.scene?.id}
              effects={table.effects.filter(
                (e) => e.targetType === "character" && e.targetId === c.id,
              )}
              freeCell={table.scene ? firstFreeCell(table.scene) : { x: 0, y: 0 }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CharacterCard({
  character,
  href,
  mine,
  canPlace,
  sceneId,
  effects,
  freeCell,
}: {
  character: CharacterView;
  href: string;
  mine: boolean;
  canPlace: boolean;
  sceneId?: string;
  effects: EffectView[];
  freeCell: { x: number; y: number };
}) {
  const send = useMesaAction();
  const [placeError, setPlaceError] = useState<string | null>(null);
  const derived = useMemo(() => {
    if (!character.base) return null;
    try {
      return deriveCharacter(character.base, characterEffects(effects, character.id), SRD);
    } catch {
      return null;
    }
  }, [character.base, character.id, effects]);

  return (
    <article className="rounded-lg border border-line bg-bg/50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={href} className="truncate font-display text-lg hover:text-accent">
          {character.name}
        </Link>
        <span className="shrink-0 text-xs text-faint">{mine ? "seu" : character.ownerName}</span>
      </div>
      <p className="flex items-center justify-between gap-2 text-xs text-muted">
        {characterSummary(character)}
        {canPlace && sceneId && (
          <button
            type="button"
            onClick={async () => {
              const res = await send("token:create", {
                sceneId,
                characterId: character.id,
                ...freeCell,
              });
              setPlaceError(res.ok ? null : res.error);
            }}
            className="flex shrink-0 items-center gap-1 text-accent hover:underline"
          >
            <MapPin size={12} /> Pôr no mapa
          </button>
        )}
      </p>
      {placeError && <p className="text-xs text-fumble">{placeError}</p>}
      {effects.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {effects.map((e) => (
            <li key={e.id} className="rounded-full bg-gm/10 px-2 py-0.5 text-[11px] text-gm">
              {e.sourceName}
              {e.roundsLeft !== null && (
                <span className="text-faint"> · {roundsLabel(e.roundsLeft)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {derived && character.base && (
        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Quick label="PV" value={`${character.base.hp.current}/${derived.hp.total}`} />
          <Quick
            label="CA"
            value={String(derived.ac.total.total)}
            hint={`toque ${derived.ac.touch} · surpreso ${derived.ac.flatFooted}`}
          />
          <Quick
            label="Inic."
            value={signed(derived.initiative.total)}
            roll={{ label: `Iniciativa (${character.name})`, bonus: derived.initiative.total }}
          />
          <Quick label="Desl." value={meters(derived.speed.total)} />
          <Quick
            label="Fort"
            value={signed(derived.saves.fort.total)}
            roll={{ label: `Fortitude (${character.name})`, bonus: derived.saves.fort.total }}
          />
          <Quick
            label="Ref"
            value={signed(derived.saves.ref.total)}
            roll={{ label: `Reflexos (${character.name})`, bonus: derived.saves.ref.total }}
          />
          <Quick
            label="Von"
            value={signed(derived.saves.will.total)}
            roll={{ label: `Vontade (${character.name})`, bonus: derived.saves.will.total }}
          />
          <Quick label="BBA" value={signed(derived.bab)} />
        </dl>
      )}
      {derived && derived.attacks.length > 0 && (
        <ul className="mt-2 border-t border-line pt-2 text-xs">
          {derived.attacks.map((a) => (
            <li key={a.weaponId} className="flex items-center justify-between gap-2 py-0.5">
              <span className="truncate text-muted">{a.name}</span>
              <span className="flex shrink-0 items-center gap-1 font-mono">
                {a.bonuses.map(signed).join("/")}
                <span className="text-faint">
                  {a.damageDice}
                  {a.damage.total ? signed(a.damage.total) : ""}
                </span>
                <RollButton label={`${a.name} (${character.name})`} bonus={a.bonuses[0]!} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Quick({
  label,
  value,
  hint,
  roll,
}: {
  label: string;
  value: string;
  hint?: string;
  roll?: { label: string; bonus: number };
}) {
  return (
    <div title={hint} className="rounded-md bg-surface-2/60 px-1 py-1.5">
      <dt className="text-[10px] tracking-wide text-faint uppercase">{label}</dt>
      <dd className="flex items-center justify-center gap-0.5 font-mono text-sm">
        {value}
        {roll && <RollButton label={roll.label} bonus={roll.bonus} className="px-0.5" />}
      </dd>
    </div>
  );
}
