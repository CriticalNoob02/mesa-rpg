import { loadConfig } from "./config";
import { createPrisma } from "./lib/db";
import { createServer } from "./server";
import { PrismaStore } from "./store/prisma";

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);
const { http, io } = createServer({
  store: new PrismaStore(prisma),
  corsOrigins: config.CORS_ORIGINS,
  trustProxy: config.TRUST_PROXY,
  assetsDir: config.ASSETS_DIR,
});

http.listen(config.PORT, () => {
  console.log(`[mesa] server ouvindo em :${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`[mesa] ${signal}, encerrando`);
  io.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
