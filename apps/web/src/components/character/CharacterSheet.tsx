"use client";

import type { HpMode } from "@mesa/protocol";
import { ABILITY_PT, type CharacterBase, deriveCharacter, quickLevelUp } from "@mesa/rules";
import { ABILITIES, type ClassId, ptName, type Spell, SRD } from "@mesa/srd";
import clsx from "clsx";
import { ArrowLeft, ArrowUpCircle, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { RollButton } from "@/components/mesa/RollButton";
import { characterEffects, roundsLabel } from "@/lib/effects";
import { kg } from "@/lib/format";
import { useMesaAction } from "@/lib/MesaContext";
import { xpProgress } from "@/lib/party";
import {
  ALIGNMENT_PT,
  bestAttackIndex,
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
  const [levelOpen, setLevelOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
    const res = await send("character:hp", { id: characterId, delta });
    if (!res.ok) setError(res.error);
  }

  async function remove() {
    const res = await send("character:delete", { id: characterId });
    if (!res.ok) return setError(res.error);
    router.push(tableHref);
  }

  const level = base?.levels.length ?? 0;
  const xp = xpProgress(character);
  const isGm = table.me.role === "GM";
  // Jogador sobe quando o XP permite; o mestre ajusta quando quiser.
  const canLevelUp = level < 20 && (isGm || xp.canLevelUp);
  async function levelUp(classId: ClassId) {
    if (!base || !derived) return;
    const isCaster = !!SRD.classes.find((c) => c.id === classId)?.casting;
    const pool =
      spells ??
      (isCaster || derived.spellcasting.length ? (await import("@mesa/srd/spells")).SPELLS : []);
    const next = quickLevelUp(base, SRD, pool, classId);
    const res = await send("character:save", { id: characterId, base: next });
    if (!res.ok) return setError(res.error);
    setError(null);
    setLevelOpen(false);
    setNotice(
      `Subiu para o nível ${next.levels.length}! PV no log; perícias, talentos e magias preenchidos.`,
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 sm:gap-3">
          <Link
            href={tableHref}
            className="flex size-9 shrink-0 items-center justify-center text-muted hover:text-ink"
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
            <XpBar xp={character.xp} progress={xp} />
          </div>
          {canEdit && base && (
            <>
              {canLevelUp && (
                <button
                  type="button"
                  onClick={() => setLevelOpen((o) => !o)}
                  aria-expanded={levelOpen}
                  title={
                    xp.canLevelUp ? "XP suficiente para o próximo nível" : "Mestre: subir sem XP"
                  }
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-ink hover:bg-[#e5b46d]"
                >
                  <ArrowUpCircle size={15} />
                  <span className="hidden sm:inline">Subir de nível</span>
                  <span className="sm:hidden">Nível</span>
                </button>
              )}
              <Link
                href={`${tableHref}/personagem/${characterId}/editar`}
                aria-label="Editar ficha"
                title="Editar ficha"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-sm hover:border-accent hover:text-accent"
              >
                <Pencil size={14} /> <span className="hidden sm:inline">Editar</span>
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
                  className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line text-faint hover:border-fumble hover:text-fumble"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}
        </div>
        {levelOpen && base && (
          <LevelUpBar
            base={base}
            hpMode={table.campaign.hpMode}
            onPick={levelUp}
            onCancel={() => setLevelOpen(false)}
          />
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-fumble/40 bg-fumble/10 px-3 py-2 text-sm text-fumble"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mb-4 rounded-md border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit"
          >
            {notice}
          </p>
        )}
        {!base || !derived ? (
          <Section title="Ficha">
            <p className="text-sm text-muted">Só o dono e o mestre veem a ficha completa.</p>
          </Section>
        ) : (
          <>
            <Highlights
              base={base}
              derived={derived}
              who={who}
              canEdit={canEdit}
              effects={effects}
              onHp={adjustHp}
            />
            <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-4">
                <Section title="Atributos" collapsible={{ id: "abilities" }}>
                  <ul className="grid grid-cols-3 gap-2 lg:grid-cols-2">
                    {ABILITIES.map((a) => (
                      <li
                        key={a}
                        className="rounded-lg border border-line bg-bg/50 p-2 text-center"
                      >
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

                <Section
                  title="Defesa em detalhe"
                  collapsible={{ id: "defense", defaultOpen: false }}
                >
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
                      <Row key={k} label={SAVE_PT[k]}>
                        <StatValue stat={derived.saves[k]} />
                      </Row>
                    ))}
                    <Row label="Iniciativa">
                      <StatValue stat={derived.initiative} />
                    </Row>
                    <Row label="Pontos de vida máx.">
                      <StatValue stat={derived.hp} format={String} />
                    </Row>
                    <Row label="Deslocamento">
                      <span className="font-mono" title={derived.speed.notes.join(", ")}>
                        {meters(derived.speed.total)}
                      </span>
                    </Row>
                    {(base.hp.temp > 0 || base.hp.nonlethal > 0) && (
                      <p className="text-xs text-muted">
                        {base.hp.temp > 0 && `${base.hp.temp} PV temporários `}
                        {base.hp.nonlethal > 0 && `${base.hp.nonlethal} de dano não letal`}
                      </p>
                    )}
                  </dl>
                </Section>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <Section
                  title="Ataques"
                  collapsible={{ id: "attacks" }}
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

                <Section title="Perícias" collapsible={{ id: "skills", defaultOpen: false }}>
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

                <Section
                  title="Talentos e habilidades"
                  collapsible={{ id: "feats", defaultOpen: false }}
                >
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
                      collapsible={{ id: `spells-${c.classId}` }}
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
                  collapsible={{ id: "gear", defaultOpen: false }}
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
                  <Section
                    title="Idiomas e notas"
                    collapsible={{ id: "notes", defaultOpen: false }}
                  >
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
          </>
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-1">{children}</dd>
    </div>
  );
}

const SAVE_PT = { fort: "Fortitude", ref: "Reflexos", will: "Vontade" } as const;

type Derived = ReturnType<typeof deriveCharacter>;

/** Faixa de destaques: o que se usa a toda hora na mesa. */
function Highlights({
  base,
  derived,
  who,
  canEdit,
  effects,
  onHp,
}: {
  base: CharacterBase;
  derived: Derived;
  who: string;
  canEdit: boolean;
  effects: { id: string; sourceName: string; roundsLeft: number | null }[];
  onHp: (delta: number) => void;
}) {
  const [amount, setAmount] = useState(5);
  const max = derived.hp.total;
  const pct = Math.max(0, Math.min(100, (base.hp.current / Math.max(1, max)) * 100));
  const atk = derived.attacks[bestAttackIndex(derived.attacks)];
  const dmg = atk
    ? `${atk.damageDice}${atk.damage.total ? (atk.damage.total > 0 ? "+" : "") + atk.damage.total : ""}`
    : "";
  return (
    <section
      aria-label="Destaques"
      className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]"
    >
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs tracking-wide text-faint uppercase">Pontos de vida</h2>
          {base.hp.current <= 0 && <span className="text-xs text-fumble">caído</span>}
        </div>
        <p className="mt-1 font-mono text-4xl leading-none">
          <span className={clsx(base.hp.current <= 0 && "text-fumble")}>{base.hp.current}</span>
          <span className="text-xl text-faint"> / {max}</span>
          {base.hp.temp > 0 && (
            <span className="ml-2 text-sm text-crit">+{base.hp.temp} temp.</span>
          )}
        </p>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-bg" aria-hidden>
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${pct}%`,
              background: pct > 50 ? "#86c98f" : pct > 25 ? "#d9a45b" : "#e46d61",
            }}
          />
        </div>
        {canEdit && (
          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Tirar ${amount} PV`}
              title={`Dano: tirar ${amount} PV`}
              onClick={() => onHp(-amount)}
              className="flex h-10 flex-1 items-center justify-center gap-1 rounded-md border border-line text-sm hover:border-fumble hover:text-fumble"
            >
              <Minus size={14} /> Dano
            </button>
            <input
              type="number"
              min={1}
              max={999}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
              aria-label="Quantidade de PV"
              className="h-10 w-16 rounded-md border border-line bg-bg text-center font-mono focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              aria-label={`Curar ${amount} PV`}
              title={`Cura: somar ${amount} PV`}
              onClick={() => onHp(amount)}
              className="flex h-10 flex-1 items-center justify-center gap-1 rounded-md border border-line text-sm hover:border-crit hover:text-crit"
            >
              <Plus size={14} /> Cura
            </button>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          <Tile
            label="CA"
            value={String(derived.ac.total.total)}
            sub={`toque ${derived.ac.touch}`}
          />
          <Tile
            label="Iniciativa"
            value={signed(derived.initiative.total)}
            roll={{ label: `Iniciativa (${who})`, bonus: derived.initiative.total }}
          />
          <Tile label="Desloc." value={meters(derived.speed.total)} />
          {(["fort", "ref", "will"] as const).map((k) => (
            <Tile
              key={k}
              label={SAVE_PT[k]}
              value={signed(derived.saves[k].total)}
              roll={{ label: `${SAVE_PT[k]} (${who})`, bonus: derived.saves[k].total }}
            />
          ))}
        </dl>
        {atk && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-bg/50 px-3 py-2 text-sm">
            <span className="text-xs tracking-wide text-faint uppercase">Ataque</span>
            <span className="min-w-0 flex-1 truncate font-medium">{atk.name}</span>
            <span className="flex items-center gap-1 font-mono">
              {atk.bonuses.map(signed).join("/")}
              <RollButton label={`${atk.name} (${who})`} bonus={atk.bonuses[0]!} />
            </span>
            <span className="flex items-center gap-1 font-mono">
              {dmg}
              <RollButton label={`Dano ${atk.name} (${who})`} expr={dmg} />
            </span>
          </div>
        )}
        {effects.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Efeitos ativos">
            {effects.map((e) => (
              <li key={e.id} className="rounded-full bg-gm/15 px-2.5 py-0.5 text-xs text-gm">
                {e.sourceName}
                {e.roundsLeft !== null && (
                  <span className="text-gm/70"> · {roundsLabel(e.roundsLeft)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  roll,
}: {
  label: string;
  value: string;
  sub?: string;
  roll?: { label: string; bonus: number };
}) {
  return (
    <div className="rounded-lg bg-bg/50 px-1 py-2">
      <dt className="truncate text-[10px] tracking-wide text-faint uppercase">{label}</dt>
      <dd className="flex items-center justify-center gap-0.5 font-mono text-lg leading-tight">
        {value}
        {roll && <RollButton label={roll.label} bonus={roll.bonus} />}
      </dd>
      {sub && <p className="text-[10px] text-faint">{sub}</p>}
    </div>
  );
}

/** Experiência rumo ao próximo nível. */
function XpBar({ xp, progress }: { xp: number; progress: ReturnType<typeof xpProgress> }) {
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-faint">
      <div
        className="h-1 w-24 overflow-hidden rounded-full bg-line sm:w-32"
        role="progressbar"
        aria-label="Experiência"
        aria-valuemin={progress.from}
        aria-valuemax={progress.to}
        aria-valuenow={xp}
      >
        <div
          className={clsx("h-full rounded-full", progress.canLevelUp ? "bg-crit" : "bg-accent")}
          style={{ width: `${progress.pct}%` }}
        />
      </div>
      <span className="font-mono">
        {fmt(xp)}
        {progress.level < 20 && ` / ${fmt(progress.to)}`} XP
      </span>
      {progress.canLevelUp && <span className="text-crit">pode subir de nível!</span>}
    </div>
  );
}

/** Escolhe a classe do novo nível (a principal já vem marcada). */
function LevelUpBar({
  base,
  hpMode,
  onPick,
  onCancel,
}: {
  base: CharacterBase;
  hpMode: HpMode;
  onPick: (c: ClassId) => Promise<void>;
  onCancel: () => void;
}) {
  const counts = new Map<ClassId, number>();
  for (const l of base.levels) counts.set(l.classId, (counts.get(l.classId) ?? 0) + 1);
  const main = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  const [classId, setClassId] = useState<ClassId>(main);
  const [busy, setBusy] = useState(false);
  const cls = SRD.classes.find((c) => c.id === classId)!;
  return (
    <div className="border-t border-line bg-surface-2/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
        <span>
          Nível <strong>{base.levels.length + 1}</strong> de
        </span>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value as ClassId)}
          aria-label="Classe do novo nível"
          className="h-9 rounded-md border border-line bg-bg px-2"
        >
          {SRD.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.namePt}
              {counts.get(c.id) ? ` (${counts.get(c.id)})` : ""}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          {hpMode === "roll"
            ? `PV: 1d${cls.hitDie} rolado pelo servidor`
            : `+${Math.floor(cls.hitDie / 2) + 1} PV (média do d${cls.hitDie})`}{" "}
          + Con; perícias, talentos e magias automáticos.
        </span>
        <span className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md px-3 text-muted hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onPick(classId);
              setBusy(false);
            }}
            className="h-9 rounded-md bg-accent px-4 font-medium text-accent-ink hover:bg-[#e5b46d] disabled:opacity-50"
          >
            {busy ? "Subindo…" : "Confirmar"}
          </button>
        </span>
      </div>
    </div>
  );
}
