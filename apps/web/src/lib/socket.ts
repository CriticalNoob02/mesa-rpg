import type { ClientToServerEvents, ServerToClientEvents } from "@mesa/protocol";
import { io, type Socket } from "socket.io-client";
import { SERVER_URL } from "./api";

export type MesaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createMesaSocket(token: string): MesaSocket {
  return io(SERVER_URL || undefined, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnectionDelayMax: 5000,
    autoConnect: false,
  });
}
