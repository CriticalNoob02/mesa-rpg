import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  ClientToServerEvents,
  LogEntryView,
  PlayerView,
  ServerToClientEvents,
  SessionResponse,
  TableState,
} from "@mesa/protocol";
import type { DieRng } from "@mesa/rules";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { createServer, type ServerOptions } from "../src/server";
import { MemoryStore } from "../src/store/memory";

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function startServer(opts: Partial<ServerOptions> & { rng?: DieRng } = {}) {
  const store = new MemoryStore();
  const assetsDir = await mkdtemp(path.join(tmpdir(), "mesa-assets-"));
  const srv = createServer({
    store,
    assetsDir,
    corsOrigins: ["http://localhost"],
    disableWriteLimit: true,
    ...opts,
  });
  await new Promise<void>((resolve) => srv.http.listen(0, resolve));
  const url = `http://localhost:${(srv.http.address() as AddressInfo).port}`;
  const clients: Client[] = [];

  return {
    ...srv,
    store,
    assetsDir,
    url,
    api: () => request(srv.app),
    async createCampaign(name = "Tumba dos Horrores", nickname = "Mestre") {
      const res = await request(srv.app)
        .post("/api/campaigns")
        .send({ name, nickname })
        .expect(201);
      return res.body as SessionResponse;
    },
    async join(campaignId: string, nickname: string) {
      const code = (await store.findCampaign(campaignId))!.inviteCode;
      const res = await request(srv.app)
        .post(`/api/invites/${code}/join`)
        .send({ nickname })
        .expect(201);
      return res.body as SessionResponse;
    },
    /** Conecta e espera o snapshot inicial. */
    async connect(token: string) {
      const socket: Client = connect(url, {
        auth: { token },
        transports: ["websocket"],
        forceNew: true,
      });
      clients.push(socket);
      const state = await new Promise<TableState>((resolve, reject) => {
        socket.once("state", resolve);
        socket.once("connect_error", reject);
      });
      return { socket, state };
    },
    async close() {
      for (const c of clients) c.disconnect();
      srv.io.close();
      await new Promise((r) => setTimeout(r, 10));
      await rm(assetsDir, { recursive: true, force: true });
    },
  };
}

export const emit = <E extends keyof ClientToServerEvents>(
  socket: Client,
  event: E,
  input: Parameters<ClientToServerEvents[E]>[0],
) =>
  new Promise<Parameters<Parameters<ClientToServerEvents[E]>[1]>[0]>((resolve) =>
    (socket.emit as any)(event, input, resolve),
  );

export const next = <E extends "log:new" | "players">(socket: Client, event: E) =>
  new Promise<E extends "log:new" ? LogEntryView : PlayerView[]>((resolve) =>
    (socket.once as any)(event, resolve),
  );

/** Coleta eventos por um tempo (para provar que algo NÃO chegou). */
export async function collectLog(socket: Client, ms = 80) {
  const got: LogEntryView[] = [];
  const fn = (e: LogEntryView) => {
    got.push(e);
  };
  socket.on("log:new", fn);
  await new Promise((r) => setTimeout(r, ms));
  socket.off("log:new", fn);
  return got;
}
