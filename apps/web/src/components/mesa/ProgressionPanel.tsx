"use client";

import type { HpMode, TableState } from "@mesa/protocol";
import { crNumber, encounterXp } from "@mesa/rules";
import clsx from "clsx";
import { Dices, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useMesaAction } from "@/lib/MesaContext";
import { characterLevel, party, xpProgress } from "@/lib/party";

const fmt = (n: number) => n.toLocaleString("pt-BR");

/**
 * Mestre: nível do grupo, regras de progressão da campanha, XP (manual ou pelos
 * monstros derrotados na cena) e nova rolagem de atributos.
 */
export function ProgressionPanel({ table }: { table: TableState }) {
  const send = useMesaAction();
  const group = party(table);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [flat, setFlat] = useState(100);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const participants = chosen ?? new Set(group.members.map((c) => c.id));

  // Monstros e NPCs com ND caídos na cena aberta.
  const defeated = useMemo(
    () =>
      (table.scene?.tokens ?? []).filter(
        (t) => !t.characterId && t.stats && t.stats.hp <= 0 && crNumber(t.stats.cr) !== null,
      ),
    [table.scene],
  );

  async function run(p: Promise<{ ok: boolean; error?: string }>, ok: string) {
    const res = await p;
    setFeedback(res.ok ? { ok: true, text: ok } : { ok: false, text: res.error ?? "Erro." });
    return res.ok;
  }

  function toggle(id: string) {
    const next = new Set(participants);
    next.has(id) ? next.delete(id) : next.add(id);
    setChosen(next);
  }

  function fromEncounter() {
    const members = group.members.filter((c) => participants.has(c.id));
    const xp = encounterXp(
      members.map(characterLevel),
      defeated.map((t) => crNumber(t.stats!.cr)!),
    );
    setAmounts(Object.fromEntries(members.map((c, i) => [c.id, xp[i]!])));
    if (!reason) setReason(summarize(defeated.map((t) => t.name)));
  }

  function fillFlat() {
    setAmounts(Object.fromEntries([...participants].map((id) => [id, flat])));
  }

  async function award() {
    const awards = group.members
      .filter((c) => participants.has(c.id) && amounts[c.id])
      .map((c) => ({ characterId: c.id, amount: amounts[c.id]! }));
    if (!awards.length) return setFeedback({ ok: false, text: "Preencha o XP de alguém." });
    const done = await run(
      send("xp:award", { awards, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      "XP entregue.",
    );
    if (done) {
      setAmounts({});
      setReason("");
    }
  }

  const players = table.players.filter((p) => p.role === "PLAYER");

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p>
          Grupo: <strong>nível {group.level}</strong>
          <span className="text-muted">
            {" "}
            · {group.size} aventureiro{group.size === 1 ? "" : "s"}
          </span>
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Ficha nova no nível
          <select
            value={table.campaign.startLevel}
            onChange={(e) =>
              run(
                send("campaign:settings", { startLevel: Number(e.target.value) }),
                "Nível inicial atualizado.",
              )
            }
            aria-label="Nível inicial de ficha nova"
            className="h-8 rounded-md border border-line bg-bg px-1.5 text-ink"
          >
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex items-center gap-1.5 text-xs text-muted">
          <legend className="sr-only">PV por nível</legend>
          PV por nível
          {(
            [
              ["average", "Média"],
              ["roll", "Rolado"],
            ] as [HpMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={table.campaign.hpMode === mode}
              onClick={() =>
                table.campaign.hpMode !== mode &&
                run(send("campaign:settings", { hpMode: mode }), "Regra de PV atualizada.")
              }
              className={clsx(
                "rounded-full border px-2 py-0.5",
                table.campaign.hpMode === mode
                  ? "border-accent text-ink"
                  : "border-line hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </div>

      {group.members.length === 0 ? (
        <p className="text-xs text-faint">Nenhum jogador criou personagem ainda.</p>
      ) : (
        <div>
          <ul className="flex flex-col divide-y divide-line/60">
            {group.members.map((c) => {
              const p = xpProgress(c);
              return (
                <li key={c.id} className="flex items-center gap-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={participants.has(c.id)}
                    onChange={() => toggle(c.id)}
                    aria-label={`${c.name} participou`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {c.name} <span className="text-xs text-faint">({c.ownerName})</span>
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-faint">
                      <span>Nív. {p.level}</span>
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-bg">
                        <span
                          className={clsx(
                            "block h-full rounded-full",
                            p.canLevelUp ? "bg-crit" : "bg-accent",
                          )}
                          style={{ width: `${p.pct}%` }}
                        />
                      </span>
                      <span className="font-mono">
                        {fmt(c.xp)}
                        {p.level < 20 && `/${fmt(p.to)}`}
                      </span>
                      {p.canLevelUp && <span className="text-crit">subir!</span>}
                    </div>
                  </div>
                  <input
                    type="number"
                    value={amounts[c.id] ?? ""}
                    placeholder="XP"
                    disabled={!participants.has(c.id)}
                    onChange={(e) =>
                      setAmounts((a) => ({ ...a, [c.id]: Math.trunc(Number(e.target.value)) }))
                    }
                    aria-label={`XP para ${c.name}`}
                    className="h-8 w-20 rounded-md border border-line bg-bg px-2 text-right font-mono focus:border-accent focus:outline-none disabled:opacity-40"
                  />
                </li>
              );
            })}
          </ul>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={fromEncounter}
              disabled={!defeated.length}
              title={
                defeated.length
                  ? "XP da tabela pelo ND de cada derrotado e o nível de cada personagem"
                  : "Nenhum monstro com ND caído na cena aberta"
              }
              className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs hover:border-accent hover:text-accent disabled:opacity-40"
            >
              <Sparkles size={12} /> Pelo encontro
              {defeated.length > 0 &&
                ` (${defeated.length} derrotado${defeated.length > 1 ? "s" : ""})`}
            </button>
            <span className="text-xs text-faint">ou</span>
            <input
              type="number"
              value={flat}
              min={0}
              onChange={(e) => setFlat(Math.trunc(Number(e.target.value)))}
              aria-label="XP igual para todos"
              className="h-8 w-20 rounded-md border border-line bg-bg px-2 text-right font-mono focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={fillFlat}
              className="h-8 rounded-md border border-line px-2.5 text-xs hover:border-accent hover:text-accent"
            >
              para todos
            </button>
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 80))}
              placeholder="Motivo (opcional)"
              aria-label="Motivo do XP"
              className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg px-3 focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={award}
              className="h-9 shrink-0 rounded-md bg-accent px-3 font-medium text-accent-ink hover:bg-[#e5b46d]"
            >
              Dar XP
            </button>
          </div>
        </div>
      )}

      {players.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted">
            Rolagem de atributos é única. Liberar outra para:
          </p>
          <ul className="flex flex-wrap gap-1">
            {players.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() =>
                    run(
                      send("character:resetRoll", { playerId: p.id }),
                      `${p.nickname} pode rolar de novo.`,
                    )
                  }
                  className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:text-accent"
                >
                  <Dices size={11} /> {p.nickname}
                </button>
              </li>
            ))}
          </ul>
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

/** "Goblin 2", "Goblin 3", "Orc" → "Goblin ×2, Orc". */
function summarize(names: string[]) {
  const counts = new Map<string, number>();
  for (const n of names) {
    const key = n.replace(/\s+(\(\d+\)|\d+)$/, "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([n, c]) => (c > 1 ? `${n} ×${c}` : n))
    .join(", ")
    .slice(0, 80);
}
