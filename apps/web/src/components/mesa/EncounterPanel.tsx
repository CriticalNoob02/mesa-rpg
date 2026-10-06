"use client";

import type { TableState } from "@mesa/protocol";
import {
  crForGroup,
  crNumber,
  DIFFICULTIES,
  type Difficulty,
  difficultyOf,
  encounterLevel,
  encounterXp,
  targetEncounterLevel,
} from "@mesa/rules";
import type { Monster } from "@mesa/srd";
import clsx from "clsx";
import { Dices, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { firstFreeCell } from "@/components/map/geometry";
import { useMesaAction } from "@/lib/MesaContext";
import { characterLevel, party } from "@/lib/party";
import { matches } from "@/lib/search";
import { useMesa } from "@/lib/store";

type MonstersModule = typeof import("@mesa/srd/monsters");
type Plan = { monster: Monster; count: number; cr: number };

const COUNTS = [1, 2, 3, 4, 6] as const;
const crLabel = (cr: number) => (cr >= 1 ? String(cr) : `1/${Math.round(1 / cr)}`);

/**
 * Sorteia um grupo de monstros iguais do SRD com o Nível de Encontro certo
 * para o grupo: ND = NE alvo − 2·log2(quantidade).
 */
export function pickEncounter(
  monsters: Monster[],
  targetEl: number,
  count: number,
  query: string,
  rng: () => number = Math.random,
): Plan | null {
  const cr = crForGroup(targetEl, count);
  if (cr === null) return null;
  const fits = (m: Monster, want: number) =>
    crNumber(m.cr) === want &&
    (!query || matches(query, m.namePt ?? m.name, m.name, m.typePt ?? m.type));
  // ND exato; se o filtro não tiver, o mais perto que tiver.
  for (const delta of [0, -1, 1, -2, 2]) {
    const want = cr >= 1 ? cr + delta : cr;
    if (want <= 0 || (cr < 1 && delta !== 0)) continue;
    const pool = monsters.filter((m) => fits(m, want));
    if (pool.length) return { monster: pool[Math.floor(rng() * pool.length)]!, count, cr: want };
  }
  return null;
}

export function EncounterPanel({ table }: { table: TableState }) {
  const send = useMesaAction();
  const [mod, setMod] = useState<MonstersModule | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [count, setCount] = useState<number>(3);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const group = party(table);
  const levels = group.members.length ? group.members.map(characterLevel) : [group.level];
  const target = targetEncounterLevel(group.level, Math.max(1, group.size), difficulty);

  useEffect(() => {
    import("@mesa/srd/monsters").then(setMod);
  }, []);

  function roll() {
    if (!mod) return;
    const p = pickEncounter(mod.MONSTERS, target, count, query.trim());
    setPlan(p);
    setFeedback(
      p ? null : { ok: false, text: "Nada com esse filtro. Mude o tipo ou a quantidade." },
    );
  }

  async function place() {
    if (!plan) return;
    let placed = 0;
    for (let i = 0; i < plan.count; i++) {
      // Cena fresca a cada token: o anterior já chegou antes do ack.
      const scene = useMesa.getState().table?.scene;
      if (!scene) break;
      const size = Math.min(4, plan.monster.squares);
      const res = await send("token:create", {
        sceneId: scene.id,
        monsterId: plan.monster.id,
        hidden,
        ...firstFreeCell(scene, size),
      });
      if (!res.ok) {
        setFeedback({ ok: false, text: res.error });
        return;
      }
      placed++;
    }
    setFeedback({ ok: true, text: `${placed}× ${name(plan.monster)} no mapa.` });
  }

  if (!table.scene) return <p className="text-sm text-faint">Crie ou abra uma cena primeiro.</p>;

  const crs = plan ? Array<number>(plan.count).fill(plan.cr) : [];
  const el = plan ? encounterLevel(crs) : 0;
  const xp = plan ? encounterXp(levels, crs) : [];
  const avgXp = xp.length ? Math.round(xp.reduce((s, v) => s + v, 0) / xp.length) : 0;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-xs text-muted">
        Grupo nível {group.level}
        {group.size ? `, ${group.size} personagens` : " (nível inicial)"} → NE alvo{" "}
        <strong className="text-ink">{target}</strong>
      </p>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Dificuldade">
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={difficulty === d}
            onClick={() => setDifficulty(d)}
            className={clsx(
              "rounded-full border px-2.5 py-0.5 text-xs",
              difficulty === d ? "border-accent text-ink" : "border-line text-muted hover:text-ink",
            )}
          >
            {DIFFICULTIES[d].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-muted">Quantos</span>
        {COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={count === n}
            onClick={() => setCount(n)}
            className={clsx(
              "size-7 rounded-md border text-xs",
              count === n ? "border-accent text-ink" : "border-line text-muted hover:text-ink",
            )}
          >
            {n}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="tipo ou nome (morto-vivo, orc…)"
          aria-label="Filtro do encontro"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-xs focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={roll}
          disabled={!mod}
          className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 hover:border-accent hover:text-accent disabled:opacity-40"
        >
          <Dices size={14} /> {plan ? "Outro" : "Sortear encontro"}
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          entra oculto
        </label>
      </div>
      {plan && (
        <div className="rounded-md border border-line p-2.5">
          <p>
            <strong>
              {plan.count}× {name(plan.monster)}
            </strong>{" "}
            <span className="text-xs text-faint">
              ND {crLabel(plan.cr)} · {plan.monster.typePt ?? plan.monster.type} · {plan.monster.hp}{" "}
              PV · CA {plan.monster.ac}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            NE {el} · {DIFFICULTIES[difficultyOf(el, group.level)].label} · ≈ {avgXp} XP por
            personagem
          </p>
          <button
            type="button"
            onClick={place}
            className="mt-2 flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-ink hover:bg-[#e5b46d]"
          >
            <MapPin size={13} /> Pôr no mapa
          </button>
        </div>
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

const name = (m: Monster) => m.namePt ?? m.name;
