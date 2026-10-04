"use client";

import { ABILITY_PT, deriveCharacter } from "@mesa/rules";
import { ABILITIES, ptName, type Spell, SRD } from "@mesa/srd";
import clsx from "clsx";
import { ArrowLeft, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RollButton } from "@/components/mesa/RollButton";
import { characterEffects, roundsLabel } from "@/lib/effects";
import { kg } from "@/lib/format";
import { useMesaAction } from "@/lib/MesaContext";
import {
  ALIGNMENT_PT,
  characterSummary,
  className,
  meters,
  SCHOOLS_PT,
  signed,
  spellText,
} from "@/lib/srd";
import { useMesa } from "@/lib/store";
import { Section, StatValue } from "./kit";

const LOAD_PT = {
  light: "leve",
  medium: "média",
  heavy: "pesada",
  overloaded: "acima do máximo",
} as const;

export function CharacterSheet({ characterId }: { characterId: string }) {
  const table = useMesa((s) => s.table)!;
  const router = useRouter();
  const send = useMesaAction();
  const character = table.characters.find((c) => c.id === characterId);
  const base = character?.base;
  const effects = useMemo(
    () => table.effects.filter((e) => e.targetType === "character" && e.targetId === characterId),
    [table.effects, characterId],
  );
  const derived = useMemo(() => {
    if (!base) return null;
    try {
      return deriveCharacter(base, characterEffects(effects, characterId), SRD);
    } catch {
      return null;
    }
  }, [base, effects, characterId]);
  const [spells, setSpells] = useState<Spell[] | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tableHref = `/mesa/${table.campaign.id}`;

  useEffect(() => {
    if (derived?.spellcasting.length && !spells)
      import("@mesa/srd/spells").then((m) => setSpells(m.SPELLS));
  }, [derived, spells]);

  if (!character) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="mb-4 text-muted">Ficha não encontrada.</p>
        <Link href={tableHref} className="text-accent hover:underline">
          Voltar à mesa
        </Link>
      </main>
    );
  }

  const canEdit = table.me.role === "GM" || character.ownerId === table.me.id;
  const who = character.name;

  async function adjustHp(delta: number) {
    if (!base || !derived) return;
    const current = Math.max(
      -10,
      Math.min(derived.hp.total + base.hp.temp, base.hp.current + delta),
    );
    const res = await send("character:save", {
      id: characterId,
      base: { ...base, hp: { ...base.hp, current } },
    });
    if (!res.ok) setError(res.error);
  }

  async function remove() {
    const res = await send("character:delete", { id: characterId });
    if (!res.ok) return setError(res.error);
    router.push(tableHref);
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link
            href={tableHref}
            className="text-muted hover:text-ink"
            aria-label="Voltar à mesa"
            title="Voltar à mesa"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl leading-tight">{character.name}</h1>
            <p className="truncate text-xs text-muted">
              {characterSummary(character)}
              {base && ` · ${ALIGNMENT_PT[base.alignment]}`} · de {character.ownerName}
            </p>
          </div>
          {canEdit && base && (
            <>
              <Link
                href={`${tableHref}/personagem/${characterId}/editar`}
                className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:border-accent hover:text-accent"
              >
                <Pencil size={14} /> Editar
              </Link>
              {confirmDelete ? (
                <span className="flex items-center gap-1 text-sm">
                  <button
                    type="button"
                    onClick={remove}
                    className="rounded-md bg-fumble/20 px-2.5 py-1.5 text-fumble hover:bg-fumble/30"
                  >
                    Excluir de vez
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 text-muted hover:text-ink"
                  >
                    Cancelar
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Excluir ficha"
                  title="Excluir ficha"
                  className="flex size-9 items-center justify-center rounded-md border border-line text-faint hover:border-fumble hover:text-fumble"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-fumble/40 bg-fumble/10 px-3 py-2 text-sm text-fumble"
          >
            {error}
          </p>
        )}
        {!base || !derived ? (
          <Section title="Ficha">
            <p className="text-sm text-muted">Só o dono e o mestre veem a ficha completa.</p>
          </Section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <Section title="Atributos">
                <ul className="grid grid-cols-3 gap-2 lg:grid-cols-2">
                  {ABILITIES.map((a) => (
                    <li key={a} className="rounded-lg border border-line bg-bg/50 p-2 text-center">
                      <p className="text-[10px] tracking-wide text-faint uppercase">
                        {ABILITY_PT[a].name}
                      </p>
                      <p className="font-mono text-2xl leading-tight">
                        {derived.abilities[a].score.total}
                      </p>
                      <p className="flex items-center justify-center gap-1 font-mono text-sm text-muted">
                        {signed(derived.abilities[a].mod)}
                        <RollButton
                          label={`Teste de ${ABILITY_PT[a].name} (${who})`}
                          bonus={derived.abilities[a].mod}
                        />
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>

              {effects.length > 0 && (
                <Section title="Efeitos ativos">
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {effects.map((e) => (
                      <li key={e.id} className="flex items-baseline justify-between gap-2">
                        <span className="text-gm">{e.sourceName}</span>
                        <span className="shrink-0 text-xs text-faint">
                          {e.roundsLeft === null ? "até tirar" : roundsLabel(e.roundsLeft)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title="Pontos de vida">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-3xl">
                    <span className={clsx(base.hp.current <= 0 && "text-fumble")}>
                      {base.hp.current}
                    </span>
                    <span className="text-lg text-faint"> / </span>
                    <StatValue stat={derived.hp} format={String} className="text-lg" />
                  </p>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label="Tirar 1 PV"
                        title="Tirar 1 PV"
                        onClick={() => adjustHp(-1)}
                        className="flex size-8 items-center justify-center rounded-md border border-line hover:border-fumble hover:text-fumble"
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Curar 1 PV"
                        title="Curar 1 PV"
                        onClick={() => adjustHp(1)}
                        className="flex size-8 items-center justify-center rounded-md border border-line hover:border-crit hover:text-crit"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {(base.hp.temp > 0 || base.hp.nonlethal > 0) && (
                  <p className="mt-1 text-xs text-muted">
                    {base.hp.temp > 0 && `${base.hp.temp} temporários `}
                    {base.hp.nonlethal > 0 && `${base.hp.nonlethal} de dano não letal`}
                  </p>
                )}
              </Section>

              <Section title="Defesa">
                <dl className="flex flex-col gap-2 text-sm">
                  <Row label="Classe de Armadura">
                    <StatValue stat={derived.ac.total} format={String} />
                  </Row>
                  <Row label="Toque / surpreso">
                    <span className="font-mono">
                      {derived.ac.touch} / {derived.ac.flatFooted}
                    </span>
                  </Row>
                  {(["fort", "ref", "will"] as const).map((k) => (
                    <Row key={k} label={{ fort: "Fortitude", ref: "Reflexos", will: "Vontade" }[k]}>
                      <StatValue stat={derived.saves[k]} />
                      <RollButton
                        label={`${{ fort: "Fortitude", ref: "Reflexos", will: "Vontade" }[k]} (${who})`}
                        bonus={derived.saves[k].total}
                      />
                    </Row>
                  ))}
                  <Row label="Iniciativa">
                    <StatValue stat={derived.initiative} />
                    <RollButton label={`Iniciativa (${who})`} bonus={derived.initiative.total} />
                  </Row>
                  <Row label="Deslocamento">
                    <span className="font-mono" title={derived.speed.notes.join(", ")}>
                      {meters(derived.speed.total)}
                    </span>
                  </Row>
                </dl>
              </Section>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <Section
                title="Ataques"
                aside={`BBA ${signed(derived.bab)} · Agarrar ${signed(derived.grapple.total)}`}
              >
                {derived.attacks.length === 0 ? (
                  <p className="text-sm text-faint">Sem armas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-faint">
                          <th className="py-1 font-normal">Arma</th>
                          <th className="py-1 font-normal">Ataque</th>
                          <th className="py-1 font-normal">Dano</th>
                          <th className="py-1 font-normal">Crítico</th>
                          <th className="py-1 font-normal">Alcance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {derived.attacks.map((a, i) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: pode ter duas armas iguais
                          <tr key={i} className="border-t border-line">
                            <td className="py-2">
                              {a.name}
                              {!a.proficient && (
                                <span className="ml-1 text-xs text-fumble">sem proficiência</span>
                              )}
                            </td>
                            <td className="py-2">
                              <span className="flex items-center gap-1">
                                <StatValue stat={a.attack} />
                                {a.bonuses.length > 1 && (
                                  <span className="font-mono text-xs text-faint">
                                    /{a.bonuses.slice(1).map(signed).join("/")}
                                  </span>
                                )}
                                <RollButton label={`${a.name} (${who})`} bonus={a.bonuses[0]!} />
                              </span>
                            </td>
                            <td className="py-2">
                              <span className="flex items-center gap-1 font-mono">
                                {a.damageDice}
                                {a.damage.total !== 0 && <StatValue stat={a.damage} />}
                                <RollButton
                                  label={`Dano ${a.name} (${who})`}
                                  expr={`${a.damageDice}${a.damage.total ? (a.damage.total > 0 ? "+" : "") + a.damage.total : ""}`}
                                />
                              </span>
                            </td>
                            <td className="py-2 font-mono text-muted">{a.critical}</td>
                            <td className="py-2 font-mono text-muted">
                              {a.rangeIncrement ? meters(a.rangeIncrement) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section title="Perícias">
                <ul className="grid gap-x-6 sm:grid-cols-2">
                  {derived.skills
                    .filter((s) => s.usable && (s.ranks > 0 || !s.parent))
                    .map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 border-t border-line py-1 text-sm"
                      >
                        <span className={clsx(s.ranks > 0 ? "text-ink" : "text-muted")}>
                          {s.namePt}
                          {s.classSkill && <span className="ml-1 text-accent">•</span>}
                        </span>
                        <span className="flex items-center gap-1">
                          <StatValue stat={s.total} />
                          <RollButton label={`${s.namePt} (${who})`} bonus={s.total.total} />
                        </span>
                      </li>
                    ))}
                </ul>
              </Section>

              <Section title="Talentos e habilidades">
                <ul className="mb-3 flex flex-col gap-2 text-sm">
                  {[
                    ...derived.feats.granted.map((id) => ({
                      id,
                      choice: undefined,
                      granted: true,
                    })),
                    ...base.feats.map((f) => ({ ...f, granted: false })),
                  ].map((f, i) => {
                    const feat = SRD.feats.find((x) => x.id === f.id);
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: talentos podem repetir
                      <li key={i}>
                        <details>
                          <summary className="cursor-pointer">
                            {feat ? ptName(feat) : f.id}
                            {f.choice && (
                              <span className="text-muted">
                                {" "}
                                (
                                {(() => {
                                  const w = SRD.weapons.find((x) => x.id === f.choice);
                                  return w ? ptName(w) : undefined;
                                })() ??
                                  SRD.skills.find((s) => s.id === f.choice)?.namePt ??
                                  f.choice}
                                )
                              </span>
                            )}
                            {f.granted && (
                              <span className="ml-1.5 text-[10px] text-faint uppercase">
                                classe
                              </span>
                            )}
                          </summary>
                          <p className="mt-1 pl-4 text-xs text-muted">
                            {feat?.benefitPt ?? feat?.benefit}
                          </p>
                        </details>
                      </li>
                    );
                  })}
                </ul>
                {derived.specials.length > 0 && (
                  <>
                    <h3 className="mb-1 text-xs tracking-wide text-faint uppercase">
                      Habilidades de classe
                    </h3>
                    <ul className="flex flex-wrap gap-1.5 text-xs">
                      {groupSpecials(derived.specials).map((s) => (
                        <li
                          key={s.text}
                          className="rounded-full border border-line px-2 py-0.5 text-muted"
                          title={s.levels}
                        >
                          {s.text}
                          {s.count > 1 && <span className="text-faint"> ×{s.count}</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>

              {derived.spellcasting.map((c) => {
                const chosen = base.spells[c.classId];
                const name = (id: string) => spells?.find((s) => s.id === id);
                return (
                  <Section
                    key={c.classId}
                    title={`Magias de ${SRD.classes.find((k) => k.id === c.classId)?.namePt}`}
                    aside={`NC ${c.casterLevel}`}
                  >
                    <p className="mb-2 font-mono text-xs text-muted">
                      Por dia:{" "}
                      {c.perDay
                        .map((n, lvl) =>
                          n == null
                            ? null
                            : `${lvl}º ${n}${c.domainPerDay[lvl] ? `+${c.domainPerDay[lvl]}` : ""} (CD ${c.dc[lvl]})`,
                        )
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {base.domains.length > 0 && c.classId === "cleric" && (
                      <p className="mb-2 text-xs text-gm">
                        Domínios:{" "}
                        {base.domains
                          .map((d) => {
                            const dom = SRD.domains.find((x) => x.id === d);
                            return dom ? ptName(dom) : d;
                          })
                          .join(", ")}
                      </p>
                    )}
                    {chosen?.prepared.some((l) => l.length) && (
                      <ul className="flex flex-col gap-1 text-sm">
                        {chosen.prepared.map((list, lvl) =>
                          list.length ? (
                            // biome-ignore lint/suspicious/noArrayIndexKey: nível é a posição
                            <li key={lvl}>
                              <span className="font-mono text-xs text-faint">{lvl}º </span>
                              {list
                                .map((id) => {
                                  const sp = name(id);
                                  return sp ? spellText(sp).name : id;
                                })
                                .join(", ")}
                            </li>
                          ) : null,
                        )}
                      </ul>
                    )}
                    {chosen && chosen.known.length > 0 && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-muted">
                          {c.classId === "wizard" ? "Grimório" : "Conhecidas"} (
                          {chosen.known.length})
                        </summary>
                        <ul className="mt-1 flex flex-col gap-1 pl-3">
                          {chosen.known.map((id) => {
                            const s = name(id);
                            return (
                              <li key={id}>
                                {s ? spellText(s).name : id}
                                {s && (
                                  <span className="text-xs text-faint">
                                    {" "}
                                    · {SCHOOLS_PT[s.school] ?? s.school} {s.levels[c.list]} ·{" "}
                                    {spellText(s).summary}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </Section>
                );
              })}

              <Section
                title="Equipamento"
                aside={`${kg(derived.load.weight)} · carga ${LOAD_PT[derived.load.category]}`}
              >
                <ul className="text-sm">
                  {base.equipment.armorId && <li>{nameOfArmor(base.equipment.armorId)}</li>}
                  {base.equipment.shieldId && <li>{nameOfArmor(base.equipment.shieldId)}</li>}
                  {base.equipment.gear.map((g, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: itens posicionais
                    <li key={i} className="text-muted">
                      {g.qty > 1 ? `${g.qty}× ` : ""}
                      {g.name}
                    </li>
                  ))}
                </ul>
                {(derived.armorCheckPenalty !== 0 || derived.arcaneSpellFailure > 0) && (
                  <p className="mt-2 text-xs text-faint">
                    Penalidade de armadura {signed(derived.armorCheckPenalty)} · falha arcana{" "}
                    {derived.arcaneSpellFailure}%
                  </p>
                )}
              </Section>

              {(base.languages.length > 0 || base.notes) && (
                <Section title="Idiomas e notas">
                  {base.languages.length > 0 && (
                    <p className="mb-2 text-sm">{base.languages.join(", ")}</p>
                  )}
                  {base.notes && (
                    <p className="text-sm whitespace-pre-line text-muted">{base.notes}</p>
                  )}
                </Section>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/** Junta habilidades repetidas ("Bonus feat" a cada nível par do guerreiro). */
export function groupSpecials(list: { classId: string; level: number; text: string }[]) {
  const map = new Map<string, { text: string; count: number; levels: string }>();
  for (const s of list) {
    const g = map.get(s.text);
    const at = `${className(s.classId)} ${s.level}`;
    if (g) {
      g.count++;
      g.levels += `, ${at}`;
    } else map.set(s.text, { text: s.text, count: 1, levels: at });
  }
  return [...map.values()];
}

function nameOfArmor(id: string) {
  const a = SRD.armor.find((x) => x.id === id);
  return a ? ptName(a) : id;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-1">{children}</dd>
    </div>
  );
}
