"use client";

import type { CharacterBase, Spellcasting } from "@mesa/rules";
import { ptName, type Spell, SRD } from "@mesa/srd";
import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { byPt, matches } from "@/lib/search";
import { className as classNamePt, SCHOOLS_PT, spellText } from "@/lib/srd";
import { Section } from "../kit";
import type { StepProps } from "../types";

export function SpellsStep({ base, update, derived, spells }: StepProps & { spells?: Spell[] }) {
  if (!derived?.spellcasting.length) {
    return (
      <Section title="Magias">
        <p className="text-sm text-faint">Nenhuma classe conjuradora.</p>
      </Section>
    );
  }
  if (!spells) {
    return (
      <Section title="Magias">
        <p className="text-sm text-faint">Carregando magias…</p>
      </Section>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {derived.spellcasting.map((c) => (
        <CasterSection key={c.classId} casting={c} base={base} update={update} spells={spells} />
      ))}
    </div>
  );
}

function CasterSection({
  casting,
  base,
  update,
  spells,
}: {
  casting: Spellcasting;
  base: CharacterBase;
  update: StepProps["update"];
  spells: Spell[];
}) {
  const [query, setQuery] = useState("");
  const chosen = base.spells[casting.classId] ?? { known: [], prepared: [] };
  const setChosen = (patch: Partial<typeof chosen>) =>
    update((d) => ({ ...d, spells: { ...d.spells, [casting.classId]: { ...chosen, ...patch } } }));
  const levels = casting.perDay
    .map((n, lvl) => (n == null ? null : lvl))
    .filter((x): x is number => x !== null);
  const onList = (lvl: number) =>
    spells
      .filter((s) => s.levels[casting.list] === lvl)
      .filter((s) => matches(query, s.pt?.name, s.name))
      .sort(byPt((s) => spellText(s).name));
  const domainSpells = (lvl: number) =>
    base.domains
      .map((d) => SRD.domains.find((x) => x.id === d)?.spells[lvl - 1]?.id)
      .filter((id): id is string => !!id)
      .map((id) => spells.find((s) => s.id === id)!)
      .filter(Boolean);

  const isWizard = casting.classId === "wizard";

  return (
    <Section
      title={`${classNamePt(casting.classId)} ${casting.classLevel}`}
      aside={`Nível de conjurador ${casting.casterLevel}`}
    >
      <PerDayTable casting={casting} />
      {casting.classId === "cleric" && (
        <DomainPicker
          value={base.domains}
          onChange={(domains) => update((d) => ({ ...d, domains }))}
        />
      )}

      {casting.casterLevel === 0 ? (
        <p className="mt-3 text-sm text-faint">Ainda não conjura magias neste nível.</p>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar magia (português ou inglês)"
            aria-label={`Buscar magia de ${classNamePt(casting.classId)}`}
            className="mt-4 h-9 w-full rounded-md border border-line bg-bg px-3 text-sm focus:border-accent focus:outline-none"
          />

          {(casting.style === "spontaneous" || isWizard) && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium">
                {isWizard ? "Grimório" : "Magias conhecidas"}
              </h3>
              {levels.map((lvl) => {
                const max = casting.style === "spontaneous" ? (casting.known?.[lvl] ?? 0) : null;
                if (max === 0) return null;
                const mine = chosen.known.filter(
                  (id) => spells.find((s) => s.id === id)?.levels[casting.list] === lvl,
                );
                return (
                  <SpellLevel
                    key={lvl}
                    level={lvl}
                    counter={max === null ? `${mine.length}` : `${mine.length} de ${max}`}
                    over={max !== null && mine.length > max}
                  >
                    {onList(lvl).map((s) => {
                      const has = chosen.known.includes(s.id);
                      return (
                        <SpellRow key={s.id} spell={s}>
                          <input
                            type="checkbox"
                            aria-label={`Conhecer ${spellText(s).name}`}
                            checked={has}
                            disabled={!has && max !== null && mine.length >= max}
                            onChange={() =>
                              setChosen({
                                known: has
                                  ? chosen.known.filter((x) => x !== s.id)
                                  : [...chosen.known, s.id],
                              })
                            }
                          />
                        </SpellRow>
                      );
                    })}
                  </SpellLevel>
                );
              })}
            </div>
          )}

          {casting.style === "prepared" && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium">Preparadas para hoje</h3>
              {levels.map((lvl) => {
                const max = (casting.perDay[lvl] ?? 0) + (casting.domainPerDay[lvl] ?? 0);
                if (max === 0) return null;
                const prepared = chosen.prepared[lvl] ?? [];
                const pool = isWizard
                  ? onList(lvl).filter((s) => chosen.known.includes(s.id))
                  : uniqueById([...onList(lvl), ...domainSpells(lvl)]);
                const setLevel = (list: string[]) => {
                  const next = Array.from(
                    { length: Math.max(chosen.prepared.length, lvl + 1) },
                    (_, i) => (i === lvl ? list : (chosen.prepared[i] ?? [])),
                  );
                  setChosen({ prepared: next });
                };
                return (
                  <SpellLevel
                    key={lvl}
                    level={lvl}
                    counter={`${prepared.length} de ${max}`}
                    over={prepared.length > max}
                  >
                    {pool.length === 0 && (
                      <p className="py-2 text-xs text-faint">
                        {isWizard ? "Marque magias deste nível no grimório." : "Nenhuma magia."}
                      </p>
                    )}
                    {pool.map((s) => {
                      const n = prepared.filter((x) => x === s.id).length;
                      return (
                        <SpellRow
                          key={s.id}
                          spell={s}
                          domain={domainSpells(lvl).some((d) => d.id === s.id)}
                        >
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Preparar uma ${spellText(s).name} a menos`}
                              disabled={n === 0}
                              onClick={() => {
                                const i = prepared.indexOf(s.id);
                                setLevel(prepared.filter((_, j) => j !== i));
                              }}
                              className="text-muted hover:text-ink disabled:opacity-30"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-4 text-center font-mono text-xs">{n}</span>
                            <button
                              type="button"
                              aria-label={`Preparar ${spellText(s).name}`}
                              disabled={prepared.length >= max}
                              onClick={() => setLevel([...prepared, s.id])}
                              className="text-muted hover:text-ink disabled:opacity-30"
                            >
                              <Plus size={13} />
                            </button>
                          </span>
                        </SpellRow>
                      );
                    })}
                  </SpellLevel>
                );
              })}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function uniqueById(list: Spell[]) {
  return [...new Map(list.map((s) => [s.id, s])).values()].sort((a, b) =>
    spellText(a).name.localeCompare(spellText(b).name, "pt-BR"),
  );
}

function PerDayTable({ casting }: { casting: Spellcasting }) {
  const levels = casting.perDay.map((n, lvl) => ({ n, lvl })).filter((x) => x.n !== null);
  if (!levels.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="text-center text-sm">
        <thead>
          <tr className="text-xs text-faint">
            <th className="pr-3 text-left font-normal">Nível</th>
            {levels.map(({ lvl }) => (
              <th key={lvl} className="w-12 font-normal">
                {lvl}º
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          <tr>
            <td className="pr-3 text-left font-sans text-xs text-faint">Por dia</td>
            {levels.map(({ n, lvl }) => (
              <td key={lvl}>
                {n}
                {casting.domainPerDay[lvl] ? (
                  <span className="text-gm">+{casting.domainPerDay[lvl]}</span>
                ) : (
                  ""
                )}
              </td>
            ))}
          </tr>
          <tr className="text-muted">
            <td className="pr-3 text-left font-sans text-xs text-faint">CD</td>
            {levels.map(({ lvl }) => (
              <td key={lvl}>{casting.dc[lvl]}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DomainPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-medium">
        Domínios <span className="font-normal text-muted">({value.length} de 2)</span>
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {[...SRD.domains].sort(byPt(ptName)).map((d) => {
          const on = value.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={on}
              title={d.grantedPowersPt ?? d.grantedPowers}
              disabled={!on && value.length >= 2}
              onClick={() => onChange(on ? value.filter((x) => x !== d.id) : [...value, d.id])}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-xs disabled:opacity-40",
                on ? "border-gm bg-gm/10 text-gm" : "border-line text-muted hover:text-ink",
              )}
            >
              {ptName(d)}
            </button>
          );
        })}
      </div>
      {value.map((id) => {
        const d = SRD.domains.find((x) => x.id === id);
        return d ? (
          <p key={id} className="mt-2 text-xs text-muted">
            <span className="text-gm">{ptName(d)}:</span> {d.grantedPowersPt ?? d.grantedPowers}
          </p>
        ) : null;
      })}
    </div>
  );
}

function SpellLevel({
  level,
  counter,
  over,
  children,
}: {
  level: number;
  counter: string;
  over: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="mb-2 rounded-lg border border-line" open={level <= 1}>
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm">
        <span>Nível {level}</span>
        <span className={clsx("font-mono text-xs", over ? "text-fumble" : "text-muted")}>
          {counter}
        </span>
      </summary>
      <ul className="max-h-80 overflow-y-auto px-3 pb-2">{children}</ul>
    </details>
  );
}

function SpellRow({
  spell,
  domain,
  children,
}: {
  spell: Spell;
  domain?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = spellText(spell);
  return (
    <li className="border-t border-line py-1.5 text-sm">
      <div className="flex items-center gap-2">
        {children}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="min-w-0 text-left hover:text-accent"
        >
          {t.name}
        </button>
        {domain && <span className="text-[10px] text-gm uppercase">domínio</span>}
        <span className="ml-auto shrink-0 text-xs text-faint">
          {SCHOOLS_PT[spell.school] ?? spell.school}
        </span>
      </div>
      <p className="pl-6 text-xs text-muted">{t.summary}</p>
      {open && (
        <div className="mt-1 pl-6 text-xs text-muted">
          <p className="text-faint">
            {t.castingTime} · {t.range} · {t.duration} · {t.components}
            {t.savingThrow && ` · TR: ${t.savingThrow}`}
            {t.spellResistance && ` · RM: ${t.spellResistance}`}
          </p>
          {(t.target || t.area || t.effect) && (
            <p className="text-faint">
              {t.target && `Alvo: ${t.target}`}
              {t.area && `Área: ${t.area}`}
              {t.effect && `Efeito: ${t.effect}`}
            </p>
          )}
          <p className="mt-1 whitespace-pre-line">{t.description}</p>
        </div>
      )}
    </li>
  );
}
