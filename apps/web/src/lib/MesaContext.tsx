"use client";

import type { Ack, ClientToServerEvents } from "@mesa/protocol";
import { createContext, useCallback, useContext } from "react";
import type { MesaSocket } from "./socket";

const ACK_TIMEOUT = 8000;

export const MesaSocketContext = createContext<MesaSocket | null>(null);

type EventName = keyof ClientToServerEvents;
type Input<E extends EventName> = Parameters<ClientToServerEvents[E]>[0];
type Result<E extends EventName> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];

/**
 * Envia um evento e espera o ack. Sem conexão ou sem resposta vira um erro
 * no formato do ack, então a tela só trata `ok`.
 */
export function useMesaAction() {
  const socket = useContext(MesaSocketContext);
  return useCallback(
    async <E extends EventName>(event: E, input: Input<E>): Promise<Result<E>> => {
      if (!socket?.connected) return { ok: false, error: "Sem conexão com a mesa." } as Result<E>;
      try {
        const timed = socket.timeout(ACK_TIMEOUT);
        const emit = timed.emitWithAck.bind(timed) as unknown as (
          e: E,
          i: Input<E>,
        ) => Promise<Result<E>>;
        return await emit(event, input);
      } catch {
        return { ok: false, error: "O servidor não respondeu. Tente de novo." } as Ack as Result<E>;
      }
    },
    [socket],
  );
}

export function useMesaSocket() {
  return useContext(MesaSocketContext);
}
