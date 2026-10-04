import type { PlayerView } from "@mesa/protocol";
import clsx from "clsx";
import { Crown } from "lucide-react";

export function PlayersBar({ players, meId }: { players: PlayerView[]; meId: string }) {
  const online = players.filter((p) => p.online).length;
  return (
    <div className="border-b border-line px-4 py-3">
      <p className="mb-2 text-xs text-muted">
        Na mesa · {online} de {players.length} online
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {players.map((p) => (
          <li
            key={p.id}
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              p.online ? "border-line text-ink" : "border-transparent text-faint",
            )}
          >
            <span className={clsx("size-1.5 rounded-full", p.online ? "bg-crit" : "bg-faint/50")} />
            {p.role === "GM" && <Crown size={11} className="text-gm" aria-label="Mestre" />}
            {p.nickname}
            {p.id === meId && <span className="text-faint">(você)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
