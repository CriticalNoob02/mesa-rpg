"use client";

import type { TableState } from "@mesa/protocol";
import { ChevronRight, Map as MapIcon, Skull, Swords, UserPlus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { CombatPanel } from "./CombatPanel";
import { MonsterPicker } from "./MonsterPicker";
import { PlaceTokens, ScenesPanel } from "./ScenesPanel";

type SectionKey = "combat" | "monsters" | "tokens" | "scene";
const STORAGE = "mesa:gm-sections";

function readOpen(): Set<SectionKey> {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return new Set(JSON.parse(raw) as SectionKey[]);
  } catch {}
  return new Set(["combat", "monsters"]);
}

/** Tudo do mestre numa coluna: combate, monstros, tokens e cena, em seções recolhíveis. */
export function GmPanel({ table }: { table: TableState }) {
  const [open, setOpen] = useState<Set<SectionKey>>(readOpen);
  const toggle = (k: SectionKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      try {
        localStorage.setItem(STORAGE, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  const sceneName = table.scenes.find((s) => s.id === table.scene?.id)?.name;

  const sections: {
    key: SectionKey;
    title: string;
    hint?: string;
    icon: ReactNode;
    body: ReactNode;
  }[] = [
    {
      key: "combat",
      title: "Combate",
      hint: table.combat ? `Rodada ${table.combat.round}` : undefined,
      icon: <Swords size={15} />,
      body: <CombatPanel table={table} bare />,
    },
    {
      key: "monsters",
      title: "Monstros prontos",
      icon: <Skull size={15} />,
      body: <MonsterPicker table={table} />,
    },
    {
      key: "tokens",
      title: "Personagens e NPC avulso",
      icon: <UserPlus size={15} />,
      body: <PlaceTokens table={table} />,
    },
    {
      key: "scene",
      title: "Cenas",
      hint: sceneName,
      icon: <MapIcon size={15} />,
      body: <ScenesPanel table={table} bare />,
    },
  ];

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      {sections.map((s) => {
        const isOpen = open.has(s.key);
        return (
          <section key={s.key} className="border-b border-line">
            <h2>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(s.key)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-2"
              >
                <span className="text-muted">{s.icon}</span>
                <span className="flex-1 font-medium">{s.title}</span>
                {s.hint && (
                  <span className="max-w-[45%] truncate text-xs text-faint">{s.hint}</span>
                )}
                <ChevronRight
                  size={15}
                  className={
                    isOpen
                      ? "rotate-90 text-muted transition-transform"
                      : "text-muted transition-transform"
                  }
                />
              </button>
            </h2>
            {isOpen && <div className="px-4 pb-4">{s.body}</div>}
          </section>
        );
      })}
    </div>
  );
}
