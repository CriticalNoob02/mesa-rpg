"use client";

import { isArmorProficient, isWeaponProficient } from "@mesa/rules";
import { SRD } from "@mesa/srd";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { meters, signed } from "@/lib/srd";
import { Section, Select, StatValue } from "../kit";
import type { StepProps } from "../types";

const LOAD_PT = {
  light: "leve",
  medium: "média",
  heavy: "pesada",
  overloaded: "acima do máximo",
} as const;
const KIND_PT = { light: "Leves", medium: "Médias", heavy: "Pesadas" } as const;
const PROF_PT = { simple: "Simples", martial: "Comuns", exotic: "Exóticas" } as const;

export function EquipmentStep({ base, update, derived }: StepProps) {
  const [weapon, setWeapon] = useState("");
  const [gearPick, setGearPick] = useState("");
  const who = {
    classIds: derived?.classLevels.map((c) => c.classId) ?? [],
    raceId: base.raceId,
    feats: base.feats,
  };
  const eq = base.equipment;
  const setEq = (patch: Partial<typeof eq>) =>
    update((d) => ({ ...d, equipment: { ...d.equipment, ...patch } }));

  return (
    <div className="flex flex-col gap-4">
      <Section title="Armadura e escudo">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Armadura"
            value={eq.armorId ?? ""}
            onChange={(v) => setEq({ armorId: v || null })}
          >
            <option value="">Sem armadura</option>
            {(["light", "medium", "heavy"] as const).map((k) => (
              <optgroup key={k} label={KIND_PT[k]}>
                {SRD.armor
                  .filter((a) => a.kind === k)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (CA +{a.bonus})
                      {isArmorProficient(a, who) ? "" : " · sem proficiência"}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
          <Select
            label="Escudo"
            value={eq.shieldId ?? ""}
            onChange={(v) => setEq({ shieldId: v || null })}
          >
            <option value="">Sem escudo</option>
            {SRD.armor
              .filter((a) => a.kind === "shield")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (CA +{a.bonus}){isArmorProficient(a, who) ? "" : " · sem proficiência"}
                </option>
              ))}
          </Select>
        </div>
        {derived && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div>
              <dt className="text-xs text-faint">CA</dt>
              <dd>
                <StatValue stat={derived.ac.total} format={String} />
              </dd>
            </div>
            <Info
              label="Toque / surpreso"
              value={`${derived.ac.touch} / ${derived.ac.flatFooted}`}
            />
            <Info
              label="Penalidade"
              value={derived.armorCheckPenalty ? signed(derived.armorCheckPenalty) : "—"}
            />
            <Info
              label="Falha arcana"
              value={derived.arcaneSpellFailure ? `${derived.arcaneSpellFailure}%` : "—"}
            />
            <Info label="Deslocamento" value={meters(derived.speed.total)} />
          </dl>
        )}
      </Section>

      <Section title="Armas">
        <ul className="mb-3 flex flex-col">
          {eq.weapons.map((id, i) => {
            const w = SRD.weapons.find((x) => x.id === id);
            const atk = derived?.attacks[i];
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: pode ter duas armas iguais
                key={i}
                className="flex flex-wrap items-center gap-x-3 border-t border-line py-2 text-sm"
              >
                <span className="w-40">{w?.name ?? id}</span>
                {atk && (
                  <span className="font-mono text-xs text-muted">
                    {atk.bonuses.map(signed).join("/")} · {atk.damageDice}
                    {atk.damage.total ? signed(atk.damage.total) : ""} · {atk.critical}
                    {!atk.proficient && (
                      <span className="text-fumble"> · sem proficiência (−4)</span>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remover ${w?.name ?? id}`}
                  title="Remover"
                  onClick={() => setEq({ weapons: eq.weapons.filter((_, j) => j !== i) })}
                  className="ml-auto text-faint hover:text-fumble"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <Select label="Arma" value={weapon} onChange={setWeapon} className="min-w-0 flex-1">
            <option value="">Escolha uma arma…</option>
            {(["simple", "martial", "exotic"] as const).map((p) => (
              <optgroup key={p} label={PROF_PT[p]}>
                {SRD.weapons
                  .filter((w) => w.proficiency === p)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.damage.medium ?? "—"})
                      {isWeaponProficient(w, who) ? "" : " · sem proficiência"}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
          <button
            type="button"
            disabled={!weapon || eq.weapons.length >= 20}
            onClick={() => {
              setEq({ weapons: [...eq.weapons, weapon] });
              setWeapon("");
            }}
            aria-label="Adicionar arma"
            title="Adicionar arma"
            className="flex size-9 items-center justify-center rounded-md border border-line hover:border-accent hover:text-accent disabled:opacity-30"
          >
            <Plus size={15} />
          </button>
        </div>
      </Section>

      <Section
        title="Equipamento"
        aside={
          derived &&
          `${derived.load.weight.toLocaleString("pt-BR")} lb · carga ${LOAD_PT[derived.load.category]} (leve até ${derived.load.light})`
        }
      >
        <ul className="mb-3 flex flex-col">
          {eq.gear.map((g, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: itens são posicionais
            <li key={i} className="flex items-center gap-2 border-t border-line py-1.5 text-sm">
              <input
                aria-label="Item"
                value={g.name}
                maxLength={60}
                onChange={(e) =>
                  setEq({
                    gear: eq.gear.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  })
                }
                className="h-8 min-w-0 flex-1 rounded border border-line bg-bg px-2 focus:border-accent focus:outline-none"
              />
              <input
                aria-label="Quantidade"
                type="number"
                min={1}
                value={g.qty}
                onChange={(e) =>
                  setEq({
                    gear: eq.gear.map((x, j) =>
                      j === i ? { ...x, qty: Number(e.target.value) } : x,
                    ),
                  })
                }
                className="h-8 w-16 rounded border border-line bg-bg px-2 font-mono focus:border-accent focus:outline-none"
              />
              <input
                aria-label="Peso (lb)"
                type="number"
                min={0}
                step={0.5}
                value={g.weight}
                onChange={(e) =>
                  setEq({
                    gear: eq.gear.map((x, j) =>
                      j === i ? { ...x, weight: Number(e.target.value) } : x,
                    ),
                  })
                }
                className="h-8 w-20 rounded border border-line bg-bg px-2 font-mono focus:border-accent focus:outline-none"
              />
              <span className="text-xs text-faint">lb</span>
              <button
                type="button"
                aria-label={`Remover ${g.name}`}
                title="Remover"
                onClick={() => setEq({ gear: eq.gear.filter((_, j) => j !== i) })}
                className="text-faint hover:text-fumble"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Select
            label="Item do Livro do Jogador"
            value={gearPick}
            onChange={setGearPick}
            className="min-w-0 flex-1"
          >
            <option value="">Item do Livro do Jogador…</option>
            {SRD.gear.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.weight} lb, {g.cost})
              </option>
            ))}
          </Select>
          <button
            type="button"
            disabled={eq.gear.length >= 100}
            onClick={() => {
              const g = SRD.gear.find((x) => x.id === gearPick);
              setEq({
                gear: [...eq.gear, { name: g?.name ?? "Item", qty: 1, weight: g?.weight ?? 0 }],
              });
              setGearPick("");
            }}
            aria-label="Adicionar item"
            title={gearPick ? "Adicionar item" : "Adicionar item personalizado"}
            className="flex size-9 items-center justify-center rounded-md border border-line hover:border-accent hover:text-accent disabled:opacity-30"
          >
            <Plus size={15} />
          </button>
        </div>
      </Section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
