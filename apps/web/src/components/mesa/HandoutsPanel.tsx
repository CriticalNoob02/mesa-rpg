"use client";

import { type HandoutView, LIMITS, type TableState } from "@mesa/protocol";
import clsx from "clsx";
import { ImagePlus, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAsset } from "@/lib/assets";
import { useMesaAction } from "@/lib/MesaContext";
import { getSession } from "@/lib/sessions";

const seenKey = (campaignId: string) => `mesa:handouts-seen:${campaignId}`;

export function readSeen(campaignId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenKey(campaignId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function markSeen(campaignId: string, ids: string[]) {
  try {
    localStorage.setItem(seenKey(campaignId), JSON.stringify(ids));
  } catch {
    // sem storage: o aviso volta ao recarregar
  }
}

/** Handouts: o mestre prepara e escolhe quem vê; o jogador vê só o que recebeu. */
export function HandoutsPanel({ table }: { table: TableState }) {
  const isGm = table.me.role === "GM";
  const authToken = getSession(table.campaign.id)?.token ?? "";

  // Abrir a aba marca tudo como visto.
  const ids = table.handouts.map((h) => h.id).join(",");
  useEffect(() => {
    markSeen(table.campaign.id, ids ? ids.split(",") : []);
  }, [ids, table.campaign.id]);

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
      {isGm && <HandoutForm table={table} authToken={authToken} />}
      {table.handouts.length === 0 ? (
        <p className="py-6 text-center text-faint">
          {isGm ? "Nenhum handout ainda." : "O mestre ainda não te mostrou nada."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {table.handouts.map((h) => (
            <li key={h.id}>
              <HandoutCard handout={h} table={table} authToken={authToken} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HandoutCard({
  handout,
  table,
  authToken,
}: {
  handout: HandoutView;
  table: TableState;
  authToken: string;
}) {
  const send = useMesaAction();
  const isGm = table.me.role === "GM";
  const { img } = useAsset(handout.assetId, authToken);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const players = table.players.filter((p) => p.role === "PLAYER");
  const rec = handout.recipients ?? [];
  const toggle = async (playerId: string) => {
    const current = rec === "all" ? players.map((p) => p.id) : rec;
    const next = current.includes(playerId)
      ? current.filter((x) => x !== playerId)
      : [...current, playerId];
    const res = await send("handout:update", { id: handout.id, recipients: next });
    setError(res.ok ? null : res.error);
  };

  return (
    <article className="rounded-lg border border-line bg-bg/50">
      {img && (
        // biome-ignore lint/performance/noImgElement: blob baixado com token, sem otimização do Next
        <img
          src={img.src}
          alt={handout.title}
          className="max-h-72 w-full rounded-t-lg object-contain bg-black/30"
        />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg">{handout.title}</h3>
          {isGm &&
            (confirm ? (
              <span className="flex shrink-0 gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => send("handout:delete", { id: handout.id })}
                  className="rounded bg-fumble/20 px-1.5 py-0.5 text-fumble"
                >
                  Apagar
                </button>
                <button type="button" onClick={() => setConfirm(false)} className="text-muted">
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirm(true)}
                aria-label={`Apagar ${handout.title}`}
                title="Apagar"
                className="text-faint hover:text-fumble"
              >
                <Trash2 size={14} />
              </button>
            ))}
        </div>
        {handout.text && <p className="mt-1 whitespace-pre-line text-muted">{handout.text}</p>}
        {isGm && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
            <span className="text-faint">Vê:</span>
            <button
              type="button"
              aria-pressed={rec === "all"}
              onClick={async () => {
                const res = await send("handout:update", {
                  id: handout.id,
                  recipients: rec === "all" ? [] : "all",
                });
                setError(res.ok ? null : res.error);
              }}
              className={clsx(
                "rounded-full border px-2 py-0.5",
                rec === "all" ? "border-accent text-accent" : "border-line text-muted",
              )}
            >
              todos
            </button>
            {players.map((p) => {
              const on = rec === "all" || rec.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.id)}
                  className={clsx(
                    "rounded-full border px-2 py-0.5",
                    on ? "border-accent text-accent" : "border-line text-muted",
                  )}
                >
                  {p.nickname}
                </button>
              );
            })}
            {rec !== "all" && rec.length === 0 && <span className="text-faint">só você</span>}
          </div>
        )}
        {error && <p className="mt-1 text-xs text-fumble">{error}</p>}
      </div>
    </article>
  );
}

function HandoutForm({ table, authToken }: { table: TableState; authToken: string }) {
  const send = useMesaAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [recipients, setRecipients] = useState<"all" | string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const players = table.players.filter((p) => p.role === "PLAYER");

  async function upload(file: File) {
    if (file.size > LIMITS.assetMaxBytes) return setError("Imagem maior que 15 MB.");
    setBusy(true);
    try {
      const asset = await api.uploadAsset(authToken, file);
      setAssetId(asset.id);
      setFileName(file.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    const res = await send("handout:create", { title, text, assetId, recipients });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setTitle("");
    setText("");
    setAssetId(null);
    setFileName("");
    setRecipients([]);
    setError(null);
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-dashed border-line p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder="Título (ex.: Carta do barão)"
        aria-label="Título do handout"
        className="h-9 rounded-md border border-line bg-bg px-3 focus:border-accent focus:outline-none"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={LIMITS.handoutText}
        rows={3}
        placeholder="Texto (opcional se tiver imagem)"
        aria-label="Texto do handout"
        className="rounded-md border border-line bg-bg px-3 py-2 focus:border-accent focus:outline-none"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        aria-label="Imagem do handout"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 self-start text-xs text-muted hover:text-ink disabled:opacity-50"
      >
        <ImagePlus size={13} /> {fileName || "Anexar imagem"}
      </button>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-faint">Mostrar para:</span>
        <button
          type="button"
          aria-pressed={recipients === "all"}
          onClick={() => setRecipients(recipients === "all" ? [] : "all")}
          className={clsx(
            "rounded-full border px-2 py-0.5",
            recipients === "all" ? "border-accent text-accent" : "border-line text-muted",
          )}
        >
          todos
        </button>
        {players.map((p) => {
          const on = recipients === "all" || recipients.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const cur = recipients === "all" ? players.map((x) => x.id) : recipients;
                setRecipients(cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]);
              }}
              className={clsx(
                "rounded-full border px-2 py-0.5",
                on ? "border-accent text-accent" : "border-line text-muted",
              )}
            >
              {p.nickname}
            </button>
          );
        })}
        {recipients !== "all" && recipients.length === 0 && (
          <span className="text-faint">(ninguém: fica guardado)</span>
        )}
      </div>
      {error && <p className="text-xs text-fumble">{error}</p>}
      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={submit}
        className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-accent text-sm font-medium text-accent-ink hover:bg-[#e5b46d] disabled:opacity-40"
      >
        <Send size={13} /> {recipients !== "all" && recipients.length === 0 ? "Guardar" : "Mostrar"}
      </button>
    </div>
  );
}
