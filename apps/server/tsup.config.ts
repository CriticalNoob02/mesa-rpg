import { defineConfig } from "tsup";

// Empacota os pacotes @mesa/* (fonte TS do workspace) e o client Prisma gerado em src/;
// o resto (express, socket.io, pg…) fica em node_modules.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  noExternal: ["@mesa/rules", "@mesa/protocol", "@mesa/srd"],
});
