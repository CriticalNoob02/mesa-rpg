"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import { saveSession } from "@/lib/sessions";
import { CenteredCard } from "./CenteredCard";

/** Link de mestre aberto em outro aparelho: guarda o token e vai para a mesa. */
export function GmLinkView({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .whoAmI(token)
      .then((me) => {
        saveSession({ campaignId: me.campaignId, token, role: me.role, nickname: me.nickname });
        router.replace(`/mesa/${me.campaignId}`);
      })
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : "Erro ao abrir o link."),
      );
  }, [token, router]);

  return (
    <CenteredCard>
      {error ? (
        <>
          <h1 className="mb-2 font-display text-2xl">Link inválido</h1>
          <p className="mb-6 text-sm text-muted">{error}</p>
          <Link href="/" className="text-sm text-accent hover:underline">
            Voltar ao início
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted">Entrando na mesa…</p>
      )}
    </CenteredCard>
  );
}
