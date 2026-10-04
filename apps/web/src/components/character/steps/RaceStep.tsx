"use client";

import { ABILITY_PT, ALIGNMENTS } from "@mesa/rules";
import { type Ability, SRD } from "@mesa/srd";
import clsx from "clsx";
import { ALIGNMENT_PT, meters, signed } from "@/lib/srd";
import { Section } from "../kit";
import type { StepProps } from "../types";

export function RaceStep({ base, update }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="Quem é">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted uppercase">Nome</span>
            <input
              value={base.name}
              maxLength={60}
              onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
              placeholder="Tordek, filho de Tardek"
              className="h-10 rounded-md border border-line bg-bg px-3 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
              Tendência
            </legend>
            <div className="grid grid-cols-3 gap-1">
              {ALIGNMENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={base.alignment === a}
                  title={ALIGNMENT_PT[a]}
                  onClick={() => update((d) => ({ ...d, alignment: a }))}
                  className={clsx(
                    "h-8 w-12 rounded border font-mono text-xs",
                    base.alignment === a
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-muted hover:text-ink",
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </Section>

      <Section title="Raça">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SRD.races.map((r) => {
            const selected = base.raceId === r.id;
            const adj = Object.entries(r.abilityAdjustments) as [Ability, number][];
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={selected}
                onClick={() => update((d) => ({ ...d, raceId: r.id }))}
                className={clsx(
                  "flex flex-col rounded-lg border p-3 text-left transition-colors",
                  selected ? "border-accent bg-accent/5" : "border-line hover:border-muted",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg">{r.namePt}</span>
                  <span className="text-xs text-faint">
                    {r.size === "small" ? "Pequeno" : "Médio"} · {meters(r.speed)}
                  </span>
                </span>
                <span className="mt-1 font-mono text-xs text-accent">
                  {adj.length
                    ? adj.map(([a, v]) => `${ABILITY_PT[a].short} ${signed(v)}`).join("  ")
                    : "Sem ajuste"}
                </span>
                <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted">
                  {r.traitsPt.map((t) => (
                    <li key={t}>· {t}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
