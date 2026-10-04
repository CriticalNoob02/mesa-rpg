import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(import.meta.dirname, "../..");

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: root,
  turbopack: { root },
  transpilePackages: ["@mesa/protocol", "@mesa/rules", "@mesa/srd"],
  poweredByHeader: false,
  async headers() {
    // O link de mestre leva o token na URL: nunca mandar como Referer.
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
};

export default config;
