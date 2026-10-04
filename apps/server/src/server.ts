import { createServer as createHttpServer } from "node:http";
import type { DieRng } from "@mesa/rules";
import cors from "cors";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { AssetFiles } from "./lib/assets";
import { cryptoDie } from "./lib/tokens";
import { registerHandlers } from "./realtime/handlers";
import { Hub, type MesaServer } from "./realtime/hub";
import { apiRouter } from "./routes/api";
import { assetsRouter } from "./routes/assets";
import type { Store } from "./store/types";

export type ServerOptions = {
  store: Store;
  /** Diretório das imagens enviadas (volume em produção). */
  assetsDir: string;
  corsOrigins: string[];
  trustProxy?: number;
  rng?: DieRng;
  /** Desliga o limite de criação/entrada por IP (testes). */
  disableWriteLimit?: boolean;
  /** Limite de ações por participante no socket. */
  socketBurst?: number;
  socketPerSecond?: number;
};

export function createServer(opts: ServerOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", opts.trustProxy ?? 0);
  app.use(cors({ origin: opts.corsOrigins }));
  app.use(express.json({ limit: "16kb" }));

  const http = createHttpServer(app);
  const io: MesaServer = new Server(http, {
    cors: { origin: opts.corsOrigins },
    maxHttpBufferSize: 64 * 1024,
    // Recupera eventos perdidos numa queda curta de rede sem refazer o snapshot.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });
  const hub = new Hub(io, opts.store);
  const files = new AssetFiles(opts.assetsDir);
  registerHandlers(io, opts.store, hub, {
    rng: opts.rng ?? cryptoDie,
    files,
    burst: opts.socketBurst,
    perSecond: opts.socketPerSecond,
  });

  const writeLimiter: RequestHandler = opts.disableWriteLimit
    ? (_req, _res, next) => next()
    : rateLimit({
        windowMs: 10 * 60 * 1000,
        limit: 30,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      });

  app.use("/api/assets", assetsRouter(opts.store, files, writeLimiter));
  app.use("/api", apiRouter(opts.store, hub, writeLimiter));
  app.use((_req, res) => {
    res.status(404).json({ error: "Não encontrado." });
  });
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError)
      return void res.status(400).json({ error: err.issues[0]!.message });
    if (err?.type === "entity.parse.failed")
      return void res.status(400).json({ error: "JSON inválido." });
    if (err?.type === "entity.too.large")
      return void res.status(413).json({ error: "Arquivo grande demais (máx. 15 MB)." });
    console.error("[http]", err);
    res.status(500).json({ error: "Erro interno." });
  };
  app.use(onError);

  return { app, http, io, hub };
}
