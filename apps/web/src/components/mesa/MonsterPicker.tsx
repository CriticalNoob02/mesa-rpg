"use client";

import type { TableState } from "@mesa/protocol";
import { crNumber, encounterXp } from "@mesa/rules";
import { type ClassId, type Monster, SRD } from "@mesa/srd";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { firstFreeCell } from "@/components/map/geometry";
import { useMesaAction } from "@/lib/MesaContext";
import { characterLevel, party } from "@/lib/party";
import { matches } from "@/lib/search";

type MonstersModule = typeof import("@mesa/srd/monsters");

const CR_BANDS = [
  { key: "party", label: "Grupo", test: () => true },
  { key: "all", label: "Todos", test: () => true },
  { key: "low", label: "ND ≤1", test: (n: number) => n <= 1 },
  { key: "mid", label: "2–5", test: (n: number) => n >= 2 && n <= 5 },
  { key: "high", label: "6–10", test: (n: number) => n >= 6 && n <= 10 },
  { key: "epic", label: "11+", test: (n: number) => n >= 11 },
] as const;
const PAGE = 40;

/**
 * Monstros do SRD com ficha completa (um clique põe no mapa), filtrados pelo
 * nível do grupo, e NPCs de classe prontos em qualquer nível.
 */
export function MonsterPicker({ table }: { table: TableState }) {
  const [tab, setTab] = useState<"srd" | "npc">("srd");
  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex self-start rounded-md border border-line p-0.5 text-xs">
        {(
          [
            ["srd", "Bestiário"],
            ["npc", "NPC de classe"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={clsx(
              "rounded px-2.5 py-1",
              tab === k ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "srd" ? <Bestiary table={table} /> : <NpcTemplate table={table} />}
    </div>
  );
}

function Bestiary({ table }: { table: TableState }) {
  const send = useMesaAction();
  const [mod, setMod] = useState<MonstersModule | null>(null);
  const [query, setQuery] = useState("");
  const group = party(table);
  const levels = group.members.length ? group.members.map(characterLevel) : [group.level];
  // Faixa útil para o grupo: de ND −3 (fácil em bando) a +3 (chefe).
  const lo = Math.max(0, group.level - 3);
  const hi = group.level + 3;
  const [band, setBand] = useState<(typeof CR_BANDS)[number]["key"]>("party");
  const [hidden, setHidden] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const scene = table.scene;

  useEffect(() => {
    import("@mesa/srd/monsters").then(setMod);
  }, []);

  const list = useMemo(() => {
    if (!mod) return [];
    const test =
      band === "party"
        ? (n: number) => n >= lo && n <= hi
        : CR_BANDS.find((b) => b.key === band)!.test;
    return mod.MONSTERS.filter(
      (m) => test(mod.crValue(m.cr)) && (!query || matches(query, m.namePt ?? m.name, m.name)),
    ).sort((a, b) => mod.crValue(a.cr) - mod.crValue(b.cr) || label(a).localeCompare(label(b)));
  }, [mod, query, band, lo, hi]);
  /** XP médio por personagem do grupo se derrotar um desses. */
  const xpEach = (m: Monster) => {
    const cr = crNumber(m.cr);
    if (cr === null) return null;
    const xp = encounterXp(levels, [cr]);
    return Math.round(xp.reduce((s, v) => s + v, 0) / xp.length);
  };

  async function place(m: Monster) {
    if (!scene) return;
    const size = Math.min(4, m.squares);
    const res = await send("token:create", {
      sceneId: scene.id,
      monsterId: m.id,
      hidden,
      ...firstFreeCell(scene, size),
    });
    setFeedback(
      res.ok ? { ok: true, text: `${label(m)} no mapa.` } : { ok: false, text: res.error },
    );
  }

  if (!scene) return <p className="text-sm text-faint">Crie ou abra uma cena primeiro.</p>;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar monstro (goblin, ogro, dragão…)"
        aria-label="Buscar monstro"
        className="h-9 rounded-md border border-line bg-bg px-3 focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-1">
        {CR_BANDS.map((b) => (
          <button
            key={b.key}
            type="button"
            aria-pressed={band === b.key}
            onClick={() => setBand(b.key)}
            className={clsx(
              "rounded-full border px-2.5 py-0.5 text-xs",
              band === b.key ? "border-accent text-ink" : "border-line text-muted hover:text-ink",
            )}
          >
            {b.key === "party" ? `Grupo (ND ${lo || "¼"}–${hi})` : b.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          entra oculto
        </label>
      </div>
      {!mod ? (
        <p className="text-xs text-faint">Carregando bestiário…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/60">
          {list.slice(0, PAGE).map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate">{label(m)}</p>
                <p className="truncate text-xs text-faint">
                  ND {m.cr} · {m.typePt ?? m.type} · {m.hp} PV · CA {m.ac}
                  {m.attacks[0] &&
                    ` · ${m.attacks[0].name} ${m.attacks[0].bonus >= 0 ? "+" : ""}${m.attacks[0].bonus}`}
                  {xpEach(m) !== null && ` · ≈${xpEach(m)} XP/pers.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => place(m)}
                title={`Pôr ${label(m)} no mapa`}
                aria-label={`Pôr ${label(m)} no mapa`}
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line hover:border-accent hover:text-accent"
              >
                <Plus size={15} />
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="py-2 text-xs text-faint">Nenhum monstro.</li>}
          {list.length > PAGE && (
            <li className="py-2 text-xs text-faint">
              Mostrando {PAGE} de {list.length}. Refine a busca.
            </li>
          )}
        </ul>
      )}
      {feedback && (
        <p
          role={feedback.ok ? "status" : "alert"}
          className={feedback.ok ? "text-xs text-crit" : "text-xs text-fumble"}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}

const label = (m: Monster) => m.namePt ?? m.name;

/** NPC pronto: modelo da classe no nível escolhido (padrão: nível do grupo). */
function NpcTemplate({ table }: { table: TableState }) {
  const send = useMesaAction();
  const group = party(table);
  const [classId, setClassId] = useState<ClassId>("fighter");
  const [raceId, setRaceId] = useState("human");
  const [level, setLevel] = useState(group.level);
  const [hidden, setHidden] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const scene = table.scene;
  if (!scene) return <p className="text-sm text-faint">Crie ou abra uma cena primeiro.</p>;

  async function place() {
    if (!scene) return;
    const res = await send("token:create", {
      sceneId: scene.id,
      npc: { classId, raceId, level },
      hidden,
      ...firstFreeCell(scene, 1),
    });
    setFeedback(res.ok ? { ok: true, text: "NPC no mapa." } : { ok: false, text: res.error });
  }

  const field = "h-9 rounded-md border border-line bg-bg px-2 text-sm";
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value as ClassId)}
          aria-label="Classe do NPC"
          className={field}
        >
          {SRD.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.namePt}
            </option>
          ))}
        </select>
        <select
          value={raceId}
          onChange={(e) => setRaceId(e.target.value)}
          aria-label="Raça do NPC"
          className={field}
        >
          {SRD.races.map((r) => (
            <option key={r.id} value={r.id}>
              {r.namePt}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          nível
          <input
            type="number"
            min={1}
            max={20}
            value={level}
            onChange={(e) => setLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            aria-label="Nível do NPC"
            className={clsx(field, "w-16 text-center font-mono")}
          />
        </label>
      </div>
      <p className="text-xs text-faint">
        Ficha montada pelo modelo da classe (atributos, equipamento, talentos). ND = nível. Grupo no
        nível {group.level}.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={place}
          className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 hover:border-accent hover:text-accent"
        >
          <Plus size={14} /> Pôr no mapa
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          entra oculto
        </label>
      </div>
      {feedback && (
        <p
          role={feedback.ok ? "status" : "alert"}
          className={feedback.ok ? "text-xs text-crit" : "text-xs text-fumble"}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
