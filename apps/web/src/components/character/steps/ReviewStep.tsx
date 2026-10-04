"use client";

import { ABILITY_PT } from "@mesa/rules";
import { ABILITIES } from "@mesa/srd";
import { Check } from "lucide-react";
import { useState } from "react";
import { ALIGNMENT_PT, className, meters, raceName, signed } from "@/lib/srd";
import { IssueList, Section, StatValue } from "../kit";
import type { StepProps } from "../types";

export function ReviewStep({
  base,
  update,
  derived,
  errors,
  warnings,
  onSave,
  saving,
}: StepProps & { onSave: () => void; saving: boolean }) {
  const [languages, setLanguages] = useState(base.languages.join(", "));
  return (
    <div className="flex flex-col gap-4">
      <Section title={errors.length ? "Falta resolver" : "Tudo certo"}>
        {errors.length === 0 && warnings.length === 0 && (
          <p className="text-sm text-crit">A ficha segue as regras. Pode salvar.</p>
        )}
        <IssueList errors={errors} warnings={warnings} />
      </Section>

      {derived && (
        <Section title={base.name || "Sem nome"}>
          <p className="mb-3 text-sm text-muted">
            {raceName(base.raceId)}{" "}
            {derived.classLevels.map((c) => `${className(c.classId)} ${c.level}`).join(" / ")} ·{" "}
            {ALIGNMENT_PT[base.alignment]}
          </p>
          <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
            {ABILITIES.map((a) => (
              <div key={a}>
                <dt className="text-xs text-faint">{ABILITY_PT[a].short}</dt>
                <dd className="font-mono">
                  {derived.abilities[a].score.total}{" "}
                  <span className="text-muted">({signed(derived.abilities[a].mod)})</span>
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-faint">PV</dt>
              <dd>
                <StatValue stat={derived.hp} format={String} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">CA</dt>
              <dd>
                <StatValue stat={derived.ac.total} format={String} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Iniciativa</dt>
              <dd>
                <StatValue stat={derived.initiative} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">BBA</dt>
              <dd className="font-mono">{signed(derived.bab)}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Deslocamento</dt>
              <dd className="font-mono">{meters(derived.speed.total)}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Resistências</dt>
              <dd className="font-mono">
                {signed(derived.saves.fort.total)}/{signed(derived.saves.ref.total)}/
                {signed(derived.saves.will.total)}
              </dd>
            </div>
          </dl>
        </Section>
      )}

      <Section title="Idiomas e notas">
        <label className="mb-3 flex flex-col gap-1.5">
          <span className="text-xs text-faint">Idiomas (separados por vírgula)</span>
          <input
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
            onBlur={() =>
              update((d) => ({
                ...d,
                languages: languages
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 20),
              }))
            }
            placeholder="Comum, Anão"
            className="h-9 rounded-md border border-line bg-bg px-3 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-faint">Notas (história, aparência, divindade…)</span>
          <textarea
            value={base.notes}
            maxLength={5000}
            rows={5}
            onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))}
            className="rounded-md border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>
      </Section>

      <button
        type="button"
        onClick={onSave}
        disabled={saving || errors.length > 0}
        className="flex h-11 items-center justify-center gap-2 self-end rounded-md bg-accent px-5 font-medium text-accent-ink hover:bg-[#e5b46d] disabled:opacity-40"
      >
        <Check size={16} /> {saving ? "Salvando…" : "Salvar ficha"}
      </button>
    </div>
  );
}
