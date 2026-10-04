"use client";

import { LIMITS } from "@mesa/protocol";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button, ErrorText, Field, Input } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import { getSession, saveSession } from "@/lib/sessions";
import { CenteredCard } from "./CenteredCard";

type Invite = { campaignId: string; campaignName: string };

export function InviteView({ code }: { code: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .invite(code)
      .then((inv) => {
        if (!alive) return;
        // Já está nesta mesa neste navegador: entra direto, sem duplicar participante.
        if (getSession(inv.campaignId)) return router.replace(`/mesa/${inv.campaignId}`);
        setInvite(inv);
      })
      .catch((err) => {
        if (alive)
          setLoadError(err instanceof ApiRequestError ? err.message : "Erro ao abrir o convite.");
      });
    return () => {
      alive = false;
    };
  }, [code, router]);

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      const s = await api.join(code, { nickname });
      saveSession({
        ...s,
        campaignName: invite.campaignName,
        role: "PLAYER",
        nickname: nickname.trim(),
      });
      router.push(`/mesa/${s.campaignId}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Não deu para entrar.");
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <CenteredCard>
        <h1 className="mb-2 font-display text-2xl">Convite inválido</h1>
        <p className="mb-6 text-sm text-muted">{loadError} Confira o código com o mestre.</p>
        <Link href="/" className="text-sm text-accent hover:underline">
          Voltar ao início
        </Link>
      </CenteredCard>
    );
  }

  if (!invite) {
    return (
      <CenteredCard>
        <p className="text-sm text-muted">Abrindo convite…</p>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <p className="mb-1 text-xs tracking-wide text-muted uppercase">Você foi chamado para</p>
      <h1 className="mb-6 font-display text-3xl">{invite.campaignName}</h1>
      <form onSubmit={join} className="flex flex-col gap-4">
        <Field label="Seu apelido na mesa">
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={LIMITS.nickname}
            placeholder="Como os outros vão te ver"
            autoFocus
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !nickname.trim()} className="mt-2">
          {busy ? "Entrando…" : "Sentar à mesa"}
        </Button>
      </form>
    </CenteredCard>
  );
}
