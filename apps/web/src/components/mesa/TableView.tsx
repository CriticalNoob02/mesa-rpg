"use client";

import clsx from "clsx";
import { useState } from "react";
import { MapView } from "@/components/map/MapView";
import { getSession } from "@/lib/sessions";
import { useMesa } from "@/lib/store";
import { CharactersPanel } from "./CharactersPanel";
import { CombatPanel } from "./CombatPanel";
import { Composer } from "./Composer";
import { HandoutsPanel, readSeen } from "./HandoutsPanel";
import { LogPanel } from "./LogPanel";
import { MesaHeader } from "./MesaHeader";
import { PlayersBar } from "./PlayersBar";
import { ScenesPanel } from "./ScenesPanel";

type Tab = "log" | "characters" | "combat" | "handouts" | "scenes";

export function TableView() {
  const table = useMesa((s) => s.table)!;
  const status = useMesa((s) => s.status);
  const [tab, setTab] = useState<Tab>("log");
  // Celular: mapa ou painel, um de cada vez.
  const [mobileView, setMobileView] = useState<"map" | "panel">("panel");
  const isGm = table.me.role === "GM";
  // Handouts que o jogador ainda não abriu (o mestre não precisa do aviso).
  // Relido a cada render: a aba Handouts grava os vistos ao abrir.
  const seen = isGm ? null : readSeen(table.campaign.id);
  const unseen = seen ? table.handouts.filter((h) => !seen.has(h.id)).length : 0;
  const token = getSession(table.campaign.id)?.token ?? "";

  return (
    <div className="flex h-dvh flex-col">
      <MesaHeader table={table} status={status} token={token} />
      <div
        role="tablist"
        aria-label="Visão"
        className="flex border-b border-line bg-surface lg:hidden"
      >
        {(
          [
            ["map", "Mapa"],
            ["panel", "Mesa"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mobileView === key}
            onClick={() => setMobileView(key)}
            className={clsx(
              "flex-1 border-b-2 py-2 text-sm",
              mobileView === key ? "border-accent text-ink" : "border-transparent text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_420px]">
        <section
          aria-label="Mapa"
          className={clsx("relative min-h-0", mobileView === "map" ? "block" : "hidden lg:block")}
        >
          <MapView table={table} />
        </section>
        <aside
          className={clsx(
            "min-h-0 min-w-0 flex-col border-line bg-surface lg:flex lg:border-l",
            mobileView === "panel" ? "flex" : "hidden",
          )}
        >
          <PlayersBar players={table.players} meId={table.me.id} />
          <div
            role="tablist"
            aria-label="Painel"
            className="scrollbar-thin flex overflow-x-auto border-b border-line px-2"
          >
            {(
              [
                ["log", "Log"],
                ["characters", `Personagens (${table.characters.length})`],
                ["combat", table.combat ? `Combate · R${table.combat.round}` : "Combate"],
                [
                  "handouts",
                  unseen > 0 && tab !== "handouts"
                    ? `Handouts (${unseen} novo${unseen > 1 ? "s" : ""})`
                    : "Handouts",
                ],
                ...(isGm ? ([["scenes", "Cenas"]] as const) : []),
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={clsx(
                  "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                  tab === key
                    ? "border-accent text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "log" && <LogPanel log={table.log} me={table.me} />}
          {tab === "characters" && <CharactersPanel table={table} />}
          {tab === "combat" && <CombatPanel table={table} />}
          {tab === "handouts" && <HandoutsPanel table={table} />}
          {tab === "scenes" && isGm && <ScenesPanel table={table} />}
          <Composer me={table.me} disabled={status !== "online"} />
        </aside>
      </div>
    </div>
  );
}
