import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4010),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3010")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  ASSETS_DIR: z.string().default("./data/assets"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
