"use client";

import { ABILITY_PT } from "@mesa/rules";
import clsx from "clsx";
import { useState } from "react";
import { Section, StatValue, Stepper } from "../kit";
import type { StepProps } from "../types";

export function SkillsStep({ update, derived }: StepProps) {
  const [onlyClass, setOnlyClass] = useState(false);
  if (!derived || derived.totalLevel === 0) {
    return (
      <Section title="Perícias">
        <p className="text-sm text-faint">Escolha a classe primeiro.</p>
      </Section>
    );
  }
  const left = derived.skillPoints.total - derived.skillPoints.spent;
  const skills = derived.skills.filter((s) => !onlyClass || s.classSkill || s.ranks > 0);

  return (
    <Section
      title="Perícias"
      aside={
        <span className={clsx(left < 0 && "text-fumble")}>
          {left} de {derived.skillPoints.total} pontos livres
        </span>
      }
    >
      <label className="mb-3 flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={onlyClass}
          onChange={(e) => setOnlyClass(e.target.checked)}
        />
        Só perícias de classe
      </label>
      <p className="mb-3 text-xs text-faint">
        Perícia de classe: 1 ponto = 1 graduação (máx. {derived.totalLevel + 3}). Fora de classe: 1
        ponto = ½ graduação (máx. {(derived.totalLevel + 3) / 2}).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-faint">
              <th className="py-1 font-normal">Perícia</th>
              <th className="py-1 font-normal">Atrib.</th>
              <th className="py-1 font-normal">Graduações</th>
              <th className="py-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="py-1.5">
                  <span className={clsx(s.classSkill ? "text-ink" : "text-muted")}>{s.namePt}</span>
                  {s.classSkill && (
                    <span className="ml-1.5 text-[10px] text-accent uppercase">classe</span>
                  )}
                  {s.trainedOnly && (
                    <span
                      className="ml-1.5 text-[10px] text-faint uppercase"
                      title="Só pode usar com graduação"
                    >
                      treinada
                    </span>
                  )}
                </td>
                <td className="py-1.5 font-mono text-xs text-muted">
                  {s.ability ? ABILITY_PT[s.ability].short : "—"}
                </td>
                <td className="py-1.5">
                  <Stepper
                    label={s.namePt}
                    value={s.ranks}
                    min={0}
                    max={s.maxRanks}
                    step={s.classSkill ? 1 : 0.5}
                    onChange={(v) =>
                      update((d) => {
                        const next = { ...d.skills };
                        if (v > 0) next[s.id] = v;
                        else delete next[s.id];
                        return { ...d, skills: next };
                      })
                    }
                  />
                </td>
                <td className={clsx("py-1.5 text-right", !s.usable && "text-faint")}>
                  {s.usable ? <StatValue stat={s.total} /> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
