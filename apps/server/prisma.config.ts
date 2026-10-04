import "dotenv/config";
import { defineConfig } from "prisma/config";

// `?? ""`: `prisma generate` roda no build sem DATABASE_URL; só migrate precisa dela.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
