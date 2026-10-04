"use client";

import type { ChatInput, Me, RollInput } from "@mesa/protocol";
import clsx from "clsx";
import { EyeOff, SendHorizontal } from "lucide-react";
import { type FormEvent, useState } from "react";
import { parseCommand } from "@/lib/command";
import { useMesaAction } from "@/lib/MesaContext";

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

type Outgoing = { event: "chat:send"; input: ChatInput } | { event: "roll"; input: RollInput };

export function Composer({ me, disabled }: { me: Me; disabled: boolean }) {
  const action = useMesaAction();
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(msg: Outgoing): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res =
      msg.event === "roll" ? await action("roll", msg.input) : await action("chat:send", msg.input);
    setBusy(false);
    if (!res.ok) setError(res.error);
    return res.ok;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cmd = parseCommand(text);
    if (!cmd) return;
    if (cmd.type === "error") return setError(cmd.message);
    const msg: Outgoing =
      cmd.type === "roll"
        ? { event: "roll", input: hidden ? { ...cmd.input, hidden: true } : cmd.input }
        : { event: "chat:send", input: cmd.input };
    if (await send(msg)) setText("");
  }

  return (
    <div className="border-t border-line p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {DICE.map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled || busy}
            onClick={() =>
              send({
                event: "roll",
                input: { expr: `1d${d}`, ...(hidden ? { hidden: true } : {}) },
              })
            }
            className="h-8 min-w-9 rounded-md border border-line px-2 font-mono text-xs text-ink hover:border-accent hover:text-accent disabled:opacity-50"
          >
            d{d}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={hidden}
          onClick={() => setHidden((h) => !h)}
          title={
            me.role === "GM"
              ? "Rolagens ocultas: só você vê"
              : "Rolagens ocultas: só você e o mestre veem"
          }
          className={clsx(
            "ml-auto flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs",
            hidden ? "border-gm/50 bg-gm/10 text-gm" : "border-line text-muted hover:text-ink",
          )}
        >
          <EyeOff size={13} /> Oculta
        </button>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          aria-label="Mensagem ou rolagem"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          maxLength={1000}
          placeholder="Mensagem, ou /r 1d20+5 ataque"
          disabled={disabled}
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-bg px-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={disabled || busy || !text.trim()}
          className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-ink hover:bg-[#e5b46d] disabled:opacity-40"
        >
          <SendHorizontal size={16} />
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-fumble">
          {error}
        </p>
      )}
    </div>
  );
}
