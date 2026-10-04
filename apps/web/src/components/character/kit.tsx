"use client";

import type { Issue, Part, Stat } from "@mesa/rules";
import clsx from "clsx";
import { AlertTriangle, Minus, Plus, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { signed } from "@/lib/srd";

export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-xl border border-line bg-surface p-4 sm:p-5", className)}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">{title}</h2>
        {aside && <div className="text-sm text-muted">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="inline-flex items-center rounded-md border border-line">
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        className="flex size-8 items-center justify-center text-muted hover:text-ink disabled:opacity-30"
      >
        <Minus size={13} />
      </button>
      <span className="w-9 text-center font-mono text-sm tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        className="flex size-8 items-center justify-center text-muted hover:text-ink disabled:opacity-30"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

export function Select({
  value,
  onChange,
  children,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        "h-9 rounded-md border border-line bg-bg px-2 text-sm text-ink focus:border-accent focus:outline-none",
        className,
      )}
    >
      {children}
    </select>
  );
}

/** Valor com a conta por trás (clique abre as parcelas). */
export function StatValue({
  stat,
  format = signed,
  className,
}: {
  stat: Stat;
  format?: (n: number) => string;
  className?: string;
}) {
  return (
    <details className={clsx("group relative inline-block", className)}>
      <summary className="cursor-pointer list-none font-mono tabular-nums underline decoration-line decoration-dotted underline-offset-4 hover:decoration-accent [&::-webkit-details-marker]:hidden">
        {format(stat.total)}
      </summary>
      <div className="absolute left-0 z-20 mt-1 min-w-52 rounded-md border border-line bg-surface-2 p-2 text-xs shadow-xl">
        <Breakdown parts={stat.parts} />
      </div>
    </details>
  );
}

export function Breakdown({ parts }: { parts: Part[] }) {
  if (!parts.length) return <p className="text-faint">Sem modificadores.</p>;
  return (
    <ul className="flex flex-col gap-0.5">
      {parts.map((p, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: parcelas não mudam de ordem
          key={i}
          className={clsx("flex justify-between gap-4", p.ignored && "text-faint line-through")}
        >
          <span>
            {p.label}
            {p.type !== "untyped" && <span className="text-faint"> ({p.type})</span>}
          </span>
          <span className="font-mono">{signed(p.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function IssueList({ errors, warnings }: { errors: Issue[]; warnings: Issue[] }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {errors.map((e, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista recalculada a cada mudança
        <li key={`e${i}`} className="flex items-start gap-2 text-fumble">
          <XCircle size={15} className="mt-0.5 shrink-0" /> {e.message}
        </li>
      ))}
      {warnings.map((w, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista recalculada a cada mudança
        <li key={`w${i}`} className="flex items-start gap-2 text-accent">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {w.message}
        </li>
      ))}
    </ul>
  );
}
