"use client";

import type { TableState } from "@mesa/protocol";
import type { Monster } from "@mesa/srd";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { firstFreeCell } from "@/components/map/geometry";
import { useMesaAction } from "@/lib/MesaContext";
import { matches } from "@/lib/search";

type MonstersModule = typeof import("@mesa/srd/monsters");

const CR_BANDS = [
  { key: "all", label: "Todos", test: () => true },
  { key: "low", label: "ND ≤1", test: (n: number) => n <= 1 },
  { key: "mid", label: "2–5", test: (n: number) => n >= 2 && n <= 5 },
  { key: "high", label: "6–10", test: (n: number) => n >= 6 && n <= 10 },
  { key: "epic", label: "11+", test: (n: number) => n >= 11 },
] as const;
const PAGE = 40;

/** Monstros do SRD com ficha completa: um clique põe no mapa. */
export function MonsterPicker({ table }: { table: TableState }) {
  const send = useMesaAction();
  const [mod, setMod] = useState<MonstersModule | null>(null);
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<(typeof CR_BANDS)[number]["key"]>("all");
  const [hidden, setHidden] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const scene = table.scene;

  useEffect(() => {
    import("@mesa/srd/monsters").then(setMod);
  }, []);

  const list = useMemo(() => {
    if (!mod) return [];
    const test = CR_BANDS.find((b) => b.key === band)!.test;
    return mod.MONSTERS.filter(
      (m) => test(mod.crValue(m.cr)) && (!query || matches(query, m.namePt ?? m.name, m.name)),
    ).sort((a, b) => mod.crValue(a.cr) - mod.crValue(b.cr) || label(a).localeCompare(label(b)));
  }, [mod, query, band]);

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
            {b.label}
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
