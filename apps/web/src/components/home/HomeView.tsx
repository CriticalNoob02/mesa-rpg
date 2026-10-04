"use client";

import { LIMITS } from "@mesa/protocol";
import { ArrowRight, Crown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import { listSessions, type StoredSession, saveSession } from "@/lib/sessions";

export function HomeView() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<StoredSession[]>([]);

  useEffect(() => setRecent(listSessions()), []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api.createCampaign({ name, nickname });
      saveSession({ ...s, campaignName: name.trim(), role: "GM", nickname: nickname.trim() });
      router.push(`/mesa/${s.campaignId}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Não deu para criar a mesa.");
      setBusy(false);
    }
  }

  function enter(e: FormEvent) {
    e.preventDefault();
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean) router.push(`/convite/${clean}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-12 sm:px-8 sm:py-20">
      <header className="mb-12 max-w-xl">
        <p className="mb-3 font-mono text-xs tracking-[0.2em] text-accent uppercase">D&amp;D 3.5</p>
        <h1 className="font-display text-5xl leading-[1.05] font-medium sm:text-6xl">Mesa RPG</h1>
        <p className="mt-4 text-lg text-muted">
          O mestre abre a mesa e manda o link. Os amigos entram com um apelido, sem conta.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-1 font-display text-2xl">Abrir uma mesa</h2>
          <p className="mb-6 text-sm text-muted">Você entra como mestre.</p>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Field label="Nome da campanha">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={LIMITS.campaignName}
                placeholder="A Tumba dos Horrores"
                required
              />
            </Field>
            <Field label="Seu apelido">
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={LIMITS.nickname}
                placeholder="Mestre"
                required
              />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy} className="mt-2 self-start">
              {busy ? "Abrindo…" : "Abrir mesa"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-1 font-display text-2xl">Tenho um código</h2>
            <p className="mb-6 text-sm text-muted">O mestre te passou um convite.</p>
            <form onSubmit={enter} className="flex gap-2">
              <Input
                aria-label="Código do convite"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABCD-2345"
                className="font-mono tracking-widest uppercase"
                maxLength={12}
              />
              <Button type="submit" variant="outline" aria-label="Entrar" disabled={!code.trim()}>
                <ArrowRight size={16} />
              </Button>
            </form>
          </Card>

          {recent.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 px-2 text-xs font-medium tracking-wide text-muted uppercase">
                Suas mesas
              </h2>
              <ul>
                {recent.map((s) => (
                  <li key={s.campaignId}>
                    <Link
                      href={`/mesa/${s.campaignId}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-surface-2"
                    >
                      <span className="truncate">{s.campaignName ?? "Mesa sem nome"}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                        {s.role === "GM" && <Crown size={12} className="text-gm" />}
                        {s.nickname}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
