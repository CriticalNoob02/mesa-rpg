"use client";

import type { TableState } from "@mesa/protocol";
import clsx from "clsx";
import { Check, Crown, Link2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ConnectionStatus } from "@/lib/store";
import { AmbientAudio } from "./AmbientAudio";

export function formatInviteCode(code: string) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function MesaHeader({
  table,
  status,
  token,
}: {
  table: TableState;
  status: ConnectionStatus;
  token: string;
}) {
  const isGm = table.me.role === "GM";
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5">
      <Link href="/" className="font-display text-lg text-muted hover:text-ink">
        Mesa
      </Link>
      <span className="text-faint">/</span>
      <h1 className="min-w-0 flex-1 truncate font-display text-lg">{table.campaign.name}</h1>

      <span
        className={clsx(
          "flex items-center gap-1.5 text-xs",
          status === "online" ? "text-muted" : "text-accent",
        )}
      >
        <span
          className={clsx(
            "size-2 rounded-full",
            status === "online" ? "bg-crit" : "animate-pulse bg-accent",
          )}
        />
        {status === "online" ? "Conectado" : "Reconectando…"}
      </span>

      <AmbientAudio audio={table.activeAudio} campaignId={table.campaign.id} />

      <div className="flex items-center gap-2">
        <CopyButton
          icon={<UserPlus size={14} />}
          label={formatInviteCode(table.campaign.inviteCode)}
          title="Copiar link de convite"
          value={`${origin}/convite/${table.campaign.inviteCode}`}
          mono
        />
        {isGm && (
          <CopyButton
            icon={<Crown size={14} className="text-gm" />}
            label="Link de mestre"
            title="Copiar seu link de mestre (abre a mesa como mestre em outro aparelho; não compartilhe)"
            value={`${origin}/gm/${token}`}
          />
        )}
      </div>
    </header>
  );
}

function CopyButton({
  icon,
  label,
  title,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt(title, value);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={title}
      className="flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-ink hover:bg-surface-2"
    >
      {copied ? <Check size={14} className="text-crit" /> : icon}
      <span className={clsx(mono && "font-mono tracking-wider")}>{copied ? "Copiado" : label}</span>
      <Link2 size={12} className="text-faint" aria-hidden />
    </button>
  );
}
