"use client";

import { ABILITY_PT } from "@mesa/rules";
import { ABILITIES, type Ability, type ClassId, SRD } from "@mesa/srd";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { signed } from "@/lib/srd";
import { Section, Select, StatValue } from "../kit";
import type { StepProps } from "../types";

const average = (hitDie: number) => Math.floor(hitDie / 2) + 1;

export function ClassStep({ base, update, derived }: StepProps) {
  const [next, setNext] = useState<ClassId>(base.levels.at(-1)?.classId ?? "fighter");
  const hitDie = (id: ClassId) => SRD.classes.find((c) => c.id === id)!.hitDie;

  function addLevel() {
    update((d) => {
      if (d.levels.length >= 20) return d;
      const first = d.levels.length === 0;
      const levels = [
        ...d.levels,
        { classId: next, hp: first ? hitDie(next) : average(hitDie(next)) },
      ];
      const need = Math.floor(levels.length / 4);
      const abilityIncreases =
        d.abilityIncreases.length < need
          ? [...d.abilityIncreases, "str" as Ability]
          : d.abilityIncreases;
      return { ...d, levels, abilityIncreases };
    });
  }

  function removeLast() {
    update((d) => {
      const levels = d.levels.slice(0, -1);
      return {
        ...d,
        levels,
        abilityIncreases: d.abilityIncreases.slice(0, Math.floor(levels.length / 4)),
      };
    });
  }

  const cls = SRD.classes.find((c) => c.id === next)!;

  return (
    <div className="flex flex-col gap-4">
      <Section title="Níveis" aside={`Nível de personagem ${base.levels.length}`}>
        {base.levels.length === 0 && (
          <p className="mb-3 text-sm text-faint">Escolha a classe do 1º nível.</p>
        )}
        <ol className="mb-4 flex flex-col">
          {base.levels.map((l, i) => {
            const c = SRD.classes.find((x) => x.id === l.classId)!;
            const classLevel = base.levels
              .slice(0, i + 1)
              .filter((x) => x.classId === l.classId).length;
            const row = c.levels[classLevel - 1];
            const specials = row?.specialPt ?? row?.special ?? [];
            const increaseIndex = (i + 1) % 4 === 0 ? (i + 1) / 4 - 1 : -1;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: níveis são posicionais
                key={i}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-sm"
              >
                <span className="w-8 font-mono text-faint">{i + 1}º</span>
                <span className="w-32">
                  {c.namePt} {classLevel}
                </span>
                <span className="flex items-center gap-1.5 text-muted">
                  PV
                  {i === 0 ? (
                    <span className="font-mono text-ink" title="1º nível: máximo do dado">
                      {l.hp}
                    </span>
                  ) : (
                    <input
                      type="number"
                      aria-label={`PV do nível ${i + 1}`}
                      min={1}
                      max={c.hitDie}
                      value={l.hp}
                      onChange={(e) =>
                        update((d) => ({
                          ...d,
                          levels: d.levels.map((x, j) =>
                            j === i ? { ...x, hp: Number(e.target.value) } : x,
                          ),
                        }))
                      }
                      className="h-8 w-14 rounded border border-line bg-bg px-2 font-mono text-ink focus:border-accent focus:outline-none"
                    />
                  )}
                  <span className="text-faint">/ d{c.hitDie}</span>
                </span>
                {increaseIndex >= 0 && (
                  <span className="flex items-center gap-1.5 text-muted">
                    +1 em
                    <Select
                      label={`Aumento de atributo do nível ${i + 1}`}
                      value={base.abilityIncreases[increaseIndex] ?? "str"}
                      onChange={(v) =>
                        update((d) => {
                          const inc = [...d.abilityIncreases];
                          inc[increaseIndex] = v as Ability;
                          return { ...d, abilityIncreases: inc };
                        })
                      }
                    >
                      {ABILITIES.map((a) => (
                        <option key={a} value={a}>
                          {ABILITY_PT[a].name}
                        </option>
                      ))}
                    </Select>
                  </span>
                )}
                {specials.length > 0 && (
                  <span className="basis-full pl-11 text-xs text-faint">
                    {specials.join(" · ")}
                  </span>
                )}
                {i === base.levels.length - 1 && (
                  <button
                    type="button"
                    onClick={removeLast}
                    aria-label="Remover último nível"
                    title="Remover último nível"
                    className="ml-auto text-faint hover:text-fumble"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Classe do próximo nível"
            value={next}
            onChange={(v) => setNext(v as ClassId)}
          >
            {SRD.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.namePt}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={addLevel}
            disabled={base.levels.length >= 20}
            className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:border-accent hover:text-accent disabled:opacity-40"
          >
            <Plus size={14} /> {base.levels.length ? "Subir de nível" : "Escolher"}
          </button>
          <span className="text-xs text-muted">
            d{cls.hitDie} · {cls.skillPoints} perícias/nível
            {cls.casting && ` · magias (${ABILITY_PT[cls.casting.ability].short})`}
          </span>
        </div>
        <p className="mt-2 text-xs text-faint">{cls.proficienciesPt ?? cls.proficiencies}</p>
      </Section>

      {derived && derived.totalLevel > 0 && (
        <Section title="Resumo">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <Stat label="BBA" value={signed(derived.bab)} />
            <div>
              <dt className="text-xs text-faint">Fortitude</dt>
              <dd>
                <StatValue stat={derived.saves.fort} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Reflexos</dt>
              <dd>
                <StatValue stat={derived.saves.ref} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Vontade</dt>
              <dd>
                <StatValue stat={derived.saves.will} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">PV máximos</dt>
              <dd>
                <StatValue stat={derived.hp} format={String} />
              </dd>
            </div>
          </dl>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
