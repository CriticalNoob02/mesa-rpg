"use client";

import { UNAUTHORIZED } from "@mesa/protocol";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { CenteredCard } from "@/components/entry/CenteredCard";
import { MesaSocketContext } from "@/lib/MesaContext";
import { getSession, removeSession, saveSession } from "@/lib/sessions";
import { createMesaSocket, type MesaSocket } from "@/lib/socket";
import { useMesa } from "@/lib/store";

/**
 * Uma conexão por mesa, compartilhada pela mesa e pelas telas de ficha (layout),
 * para trocar de tela sem reconectar.
 */
export function MesaConnection({
  campaignId,
  children,
}: {
  campaignId: string;
  children: ReactNode;
}) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [socket, setSocket] = useState<MesaSocket | null>(null);
  const status = useMesa((s) => s.status);
  const hasTable = useMesa((s) => s.table !== null);

  useEffect(() => setToken(getSession(campaignId)?.token ?? null), [campaignId]);

  useEffect(() => {
    if (!token) return;
    const store = useMesa.getState();
    store.reset();
    const s = createMesaSocket(token);

    s.on("state", (state) => {
      useMesa.getState().setState(state);
      saveSession({
        campaignId,
        token,
        campaignName: state.campaign.name,
        role: state.me.role,
        nickname: state.me.nickname,
      });
    });
    s.on("log:new", (e) => useMesa.getState().addLog(e));
    s.on("players", (p) => useMesa.getState().setPlayers(p));
    s.on("character:upsert", (c) => useMesa.getState().upsertCharacter(c));
    s.on("character:removed", ({ id }) => useMesa.getState().removeCharacter(id));
    s.on("scenes", (list) => useMesa.getState().setScenes(list));
    s.on("scene:state", (scene) => useMesa.getState().setScene(scene));
    s.on("token:update", (t) => useMesa.getState().upsertToken(t));
    s.on("token:removed", (t) => useMesa.getState().removeToken(t));
    s.on("effects", (e) => useMesa.getState().setEffects(e));
    s.on("combat", (c) => useMesa.getState().setCombat(c));
    s.on("campaign", (c) => useMesa.getState().setCampaign(c));
    s.on("abilityRoll", (r) => useMesa.getState().setAbilityRoll(r));
    s.on("handouts", (h) => useMesa.getState().setHandouts(h));
    s.on("disconnect", () => useMesa.getState().setStatus("reconnecting"));
    s.io.on("reconnect_attempt", () => useMesa.getState().setStatus("reconnecting"));
    s.on("connect_error", (err) => {
      if (err.message === UNAUTHORIZED) {
        removeSession(campaignId);
        useMesa.getState().setStatus("unauthorized");
        s.disconnect();
      } else {
        useMesa.getState().setStatus("reconnecting");
      }
    });
    s.connect();
    setSocket(s);

    return () => {
      s.removeAllListeners();
      s.io.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, [token, campaignId]);

  if (token === null || status === "unauthorized") {
    return (
      <CenteredCard>
        <h1 className="mb-2 font-display text-2xl">Você não está nesta mesa</h1>
        <p className="mb-6 text-sm text-muted">
          Peça o convite ao mestre. Se você é o mestre, abra o seu link de mestre.
        </p>
        <Link href="/" className="text-sm text-accent hover:underline">
          Voltar ao início
        </Link>
      </CenteredCard>
    );
  }

  if (!hasTable) {
    return (
      <CenteredCard>
        <p className="text-sm text-muted">
          {status === "reconnecting"
            ? "Servidor fora do ar. Tentando de novo…"
            : "Entrando na mesa…"}
        </p>
      </CenteredCard>
    );
  }

  return <MesaSocketContext.Provider value={socket}>{children}</MesaSocketContext.Provider>;
}
