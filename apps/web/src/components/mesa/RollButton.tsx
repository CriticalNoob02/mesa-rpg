"use client";

import clsx from "clsx";
import { Dices } from "lucide-react";
import { useState } from "react";
import { useMesaAction } from "@/lib/MesaContext";
import { d20 } from "@/lib/srd";

/** Rola 1d20 + bônus no servidor, com rótulo (vai para o log da mesa). */
export function RollButton({
  label,
  bonus,
  expr,
  className,
  children,
}: {
  label: string;
  bonus?: number;
  expr?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const send = useMesaAction();
  const [busy, setBusy] = useState(false);
  const expression = expr ?? d20(bonus ?? 0);
  return (
    <button
      type="button"
      title={`Rolar ${label} (${expression})`}
      aria-label={`Rolar ${label}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await send("roll", { expr: expression, label });
        setBusy(false);
      }}
      className={clsx(
        "inline-flex items-center gap-1 rounded px-1 text-faint hover:bg-surface-2 hover:text-accent disabled:opacity-50",
        className,
      )}
    >
      {children ?? <Dices size={13} />}
    </button>
  );
}
