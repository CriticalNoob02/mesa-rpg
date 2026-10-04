"use client";

import type { LogEntryView, Me } from "@mesa/protocol";
import { useEffect, useLayoutEffect, useRef } from "react";
import { LogItem } from "./LogItem";

export function LogPanel({ log, me }: { log: LogEntryView[]; me: Me }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // Só rola sozinho se a pessoa já estava no fim (não puxa quem está lendo o histórico).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rola quando o log muda
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-label="Log da mesa"
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3"
    >
      {log.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">Nada rolado ainda.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {log.map((e) => (
            <LogItem key={e.id} entry={e} meId={me.id} />
          ))}
        </ol>
      )}
    </div>
  );
}
