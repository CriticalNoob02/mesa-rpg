"use client";

import {
  ABILITY_PT,
  abilityMod,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  pointBuyCost,
} from "@mesa/rules";
import { ABILITIES, type Ability, SRD } from "@mesa/srd";
import clsx from "clsx";
import { Dices } from "lucide-react";
import { useState } from "react";
import { useMesaAction } from "@/lib/MesaContext";
import { signed } from "@/lib/srd";
import { Section, Select, Stepper } from "../kit";
import type { StepProps } from "../types";

export function AbilitiesStep({ base, update, derived }: StepProps) {
  const send = useMesaAction();
  const [pool, setPool] = useState<number[]>([]);
  const [rollError, setRollError] = useState<string | null>(null);
  const race = SRD.races.find((r) => r.id === base.raceId);
  const cost = pointBuyCost(base.abilities);

  function setMethod(method: "pointbuy" | "rolled") {
    if (method === base.abilityMethod) return;
    update((d) => ({
      ...d,
      abilityMethod: method,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    }));
  }

  async function roll() {
    setRollError(null);
    const res = await send("character:rollAbilities", {});
    if (!res.ok) return setRollError(res.error);
    const sorted = [...res.scores].sort((a, b) => b - a);
    setPool(sorted);
    // Distribui na ordem padrão; o jogador troca depois.
    update((d) => ({
      ...d,
      abilities: Object.fromEntries(ABILITIES.map((a, i) => [a, sorted[i]!])) as Record<
        Ability,
        number
      >,
    }));
  }

  /** Troca valores entre dois atributos para manter cada número da rolagem usado uma vez. */
  function assign(a: Ability, value: number) {
    update((d) => {
      const other = ABILITIES.find((x) => x !== a && d.abilities[x] === value);
      const abilities = { ...d.abilities, [a]: value };
      if (other) abilities[other] = d.abilities[a];
      return { ...d, abilities };
    });
  }

  return (
    <Section
      title="Atributos"
      aside={
        base.abilityMethod === "pointbuy" && (
          <span className={clsx(cost !== null && cost > POINT_BUY_BUDGET && "text-fumble")}>
            {cost ?? "?"} de {POINT_BUY_BUDGET} pontos
          </span>
        )
      }
    >
      <div
        className="mb-4 inline-flex rounded-md border border-line p-0.5"
        role="radiogroup"
        aria-label="Método"
      >
        {(
          [
            ["pointbuy", "Compra de pontos"],
            ["rolled", "Rolagem 4d6"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={base.abilityMethod === m}
            onClick={() => setMethod(m)}
            className={clsx(
              "rounded px-3 py-1.5 text-sm",
              base.abilityMethod === m ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {base.abilityMethod === "rolled" && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={roll}
            className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:border-accent hover:text-accent"
          >
            <Dices size={15} /> {pool.length ? "Rolar de novo" : "Rolar no servidor"}
          </button>
          <span className="text-xs text-muted">
            6× 4d6 descartando o menor. A rolagem aparece no log da mesa.
          </span>
          {rollError && <span className="text-xs text-fumble">{rollError}</span>}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-faint">
            <th className="py-1 font-normal">Atributo</th>
            <th className="py-1 font-normal">Base</th>
            {base.abilityMethod === "pointbuy" && <th className="py-1 font-normal">Custo</th>}
            <th className="py-1 font-normal">Raça</th>
            <th className="py-1 font-normal">Total</th>
            <th className="py-1 font-normal">Mod</th>
          </tr>
        </thead>
        <tbody>
          {ABILITIES.map((a) => {
            const racial = race?.abilityAdjustments[a] ?? 0;
            const total = derived?.abilities[a].score.total ?? base.abilities[a] + racial;
            return (
              <tr key={a} className="border-t border-line">
                <td className="py-2">
                  <span className="font-mono text-xs text-accent">{ABILITY_PT[a].short}</span>{" "}
                  {ABILITY_PT[a].name}
                </td>
                <td className="py-2">
                  {base.abilityMethod === "pointbuy" ? (
                    <Stepper
                      label={ABILITY_PT[a].name}
                      value={base.abilities[a]}
                      min={8}
                      max={18}
                      onChange={(v) =>
                        update((d) => ({ ...d, abilities: { ...d.abilities, [a]: v } }))
                      }
                    />
                  ) : pool.length ? (
                    <Select
                      label={ABILITY_PT[a].name}
                      value={String(base.abilities[a])}
                      onChange={(v) => assign(a, Number(v))}
                      className="w-20 font-mono"
                    >
                      {[...new Set(pool)].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="font-mono">{base.abilities[a]}</span>
                  )}
                </td>
                {base.abilityMethod === "pointbuy" && (
                  <td className="py-2 font-mono text-muted">
                    {POINT_BUY_COST[base.abilities[a]] ?? "—"}
                  </td>
                )}
                <td className="py-2 font-mono text-muted">{racial ? signed(racial) : ""}</td>
                <td className="py-2 font-mono text-base">{total}</td>
                <td className="py-2 font-mono">{signed(abilityMod(total))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}
