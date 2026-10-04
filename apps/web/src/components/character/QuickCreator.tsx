"use client";

import { deriveCharacter, quickCharacter } from "@mesa/rules";
import { type ClassId, type Spell, SRD } from "@mesa/srd";
import clsx from "clsx";
import {
  ArrowLeft,
  Axe,
  BookOpen,
  Check,
  Cross,
  Crosshair,
  Hand,
  Leaf,
  Music,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Swords,
  VenetianMask,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMesaAction } from "@/lib/MesaContext";
import { bestAttackIndex, meters, signed, spellText } from "@/lib/srd";
import { useMesa } from "@/lib/store";

const CLASS_INFO: Record<ClassId, { icon: ReactNode; role: string }> = {
  fighter: { icon: <Swords size={18} />, role: "Combatente de armadura pesada" },
  barbarian: { icon: <Axe size={18} />, role: "Fúria e muito dano" },
  paladin: { icon: <Shield size={18} />, role: "Cavaleiro sagrado, cura e protege" },
  ranger: { icon: <Crosshair size={18} />, role: "Arqueiro e rastreador" },
  rogue: { icon: <VenetianMask size={18} />, role: "Furtivo, ataque furtivo e armadilhas" },
  monk: { icon: <Hand size={18} />, role: "Luta desarmado e se move rápido" },
  cleric: { icon: <Cross size={18} />, role: "Cura, buffs e expulsa mortos-vivos" },
  druid: { icon: <Leaf size={18} />, role: "Magia da natureza e forma selvagem" },
  bard: { icon: <Music size={18} />, role: "Inspira o grupo, magia e lábia" },
  sorcerer: { icon: <Sparkles size={18} />, role: "Magia arcana inata, poucas e fortes" },
  wizard: { icon: <BookOpen size={18} />, role: "Magia arcana estudada, muitas opções" },
};
const ORDER: ClassId[] = [
  "fighter",
  "barbarian",
  "paladin",
  "ranger",
  "rogue",
  "monk",
  "cleric",
  "druid",
  "bard",
  "sorcerer",
  "wizard",
];

/** Criação em uma tela: nome, raça e classe; o resto sai do modelo da classe. */
export function QuickCreator() {
  const table = useMesa((s) => s.table)!;
  const router = useRouter();
  const send = useMesaAction();
  const [name, setName] = useState("");
  const [raceId, setRaceId] = useState("human");
  const [classId, setClassId] = useState<ClassId>("fighter");
  const [spells, setSpells] = useState<Spell[] | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCaster = !!SRD.classes.find((c) => c.id === classId)?.casting;
  const back = `/mesa/${table.campaign.id}`;

  useEffect(() => {
    if (isCaster && !spells) import("@mesa/srd/spells").then((m) => setSpells(m.SPELLS));
  }, [isCaster, spells]);

  const preview = useMemo(() => {
    if (isCaster && !spells) return null;
    const base = quickCharacter({ name: name || "Sem nome", raceId, classId }, SRD, spells ?? []);
    return { base, derived: deriveCharacter(base, [], SRD) };
  }, [name, raceId, classId, spells, isCaster]);

  async function create() {
    if (!preview || !name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await send("character:save", { base: { ...preview.base, name: name.trim() } });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    router.push(`${back}/personagem/${res.id}`);
  }

  const d = preview?.derived;
  const atk = d ? d.attacks[bestAttackIndex(d.attacks)] : undefined;
  const spellNames = preview
    ? Object.values(preview.base.spells)
        .flatMap((s) => [...(s?.known ?? []), ...(s?.prepared.flat() ?? [])])
        .filter((id, i, all) => all.indexOf(id) === i)
        .map((id) => {
          const sp = spells?.find((x) => x.id === id);
          return sp ? spellText(sp).name : id;
        })
    : [];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link
            href={back}
            className="text-muted hover:text-ink"
            aria-label="Voltar"
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg">Novo personagem</h1>
          <Link
            href={`${back}/personagem/novo/avancado`}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
          >
            <SlidersHorizontal size={13} /> Modo avançado
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-muted uppercase">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Como chamam seu herói?"
              className="h-12 rounded-lg border border-line bg-bg px-4 font-display text-xl focus:border-accent focus:outline-none"
            />
          </label>

          <section>
            <h2 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Classe</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ORDER.map((id) => {
                const c = SRD.classes.find((x) => x.id === id)!;
                const on = id === classId;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setClassId(id)}
                    className={clsx(
                      "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                      on ? "border-accent bg-accent/10" : "border-line hover:border-muted",
                    )}
                  >
                    <span className={clsx("mt-0.5", on ? "text-accent" : "text-muted")}>
                      {CLASS_INFO[id].icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{c.namePt}</span>
                      <span className="block text-xs text-muted">{CLASS_INFO[id].role}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Raça</h2>
            <div className="flex flex-wrap gap-2">
              {SRD.races.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={r.id === raceId}
                  title={r.traitsPt.join(" ")}
                  onClick={() => setRaceId(r.id)}
                  className={clsx(
                    "rounded-full border px-3.5 py-1.5 text-sm",
                    r.id === raceId
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-line text-muted hover:text-ink",
                  )}
                >
                  {r.namePt}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-faint">
              {SRD.races
                .find((r) => r.id === raceId)
                ?.traitsPt.slice(0, 2)
                .join(" ")}
            </p>
          </section>
        </div>

        <aside className="flex flex-col gap-3 self-start rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-20">
          <p className="font-display text-xl">{name.trim() || "Seu personagem"}</p>
          {!d ? (
            <p className="text-sm text-faint">Preparando magias…</p>
          ) : (
            <>
              <p className="text-sm text-muted">
                {SRD.races.find((r) => r.id === raceId)?.namePt}{" "}
                {SRD.classes.find((c) => c.id === classId)?.namePt} 1
              </p>
              <dl className="grid grid-cols-4 gap-2 text-center">
                <Stat label="PV" value={String(d.hp.total)} />
                <Stat label="CA" value={String(d.ac.total.total)} />
                <Stat label="Inic." value={signed(d.initiative.total)} />
                <Stat label="Desl." value={meters(d.speed.total)} />
              </dl>
              {atk && (
                <p className="text-sm">
                  <span className="text-muted">Ataque: </span>
                  {atk.name} {signed(atk.bonuses[0]!)}, {atk.damageDice}
                  {atk.damage.total ? signed(atk.damage.total) : ""}
                </p>
              )}
              <p className="text-xs text-muted">
                <span className="text-faint">Talentos: </span>
                {[...d.feats.granted, ...preview!.base.feats.map((f) => f.id)]
                  .map((id) => SRD.feats.find((f) => f.id === id))
                  .filter((f) => !!f)
                  .map((f) => f.namePt ?? f.name)
                  .join(", ")}
              </p>
              {spellNames.length > 0 && (
                <p className="text-xs text-muted">
                  <span className="text-faint">Magias: </span>
                  {spellNames.slice(0, 8).join(", ")}
                  {spellNames.length > 8 && ` e mais ${spellNames.length - 8}`}
                </p>
              )}
              <p className="text-xs text-faint">
                Atributos, perícias e equipamento já vêm prontos. Dá para ajustar tudo depois em
                Editar.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-fumble">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={create}
            disabled={!d || !name.trim() || saving}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent font-medium text-accent-ink hover:bg-[#e5b46d] disabled:opacity-40"
          >
            <Check size={16} /> {saving ? "Criando…" : "Criar personagem"}
          </button>
        </aside>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-bg/60 px-1 py-2">
      <dt className="text-[10px] tracking-wide text-faint uppercase">{label}</dt>
      <dd className="font-mono text-base">{value}</dd>
    </div>
  );
}
