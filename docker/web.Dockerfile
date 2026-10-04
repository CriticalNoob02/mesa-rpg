# Front da mesa (Next.js, output standalone). Sem NEXT_PUBLIC_SERVER_URL: o
# navegador fala com a mesma origem e o proxy manda /api e /socket.io ao servidor.

# ---------- Build ----------
FROM node:22-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/protocol/package.json packages/protocol/
COPY packages/rules/package.json packages/rules/
COPY packages/srd/package.json packages/srd/
RUN npm ci --ignore-scripts

COPY . .
# Vazio de propósito (mesma origem). Entra no bundle no build, não no runtime.
ENV NEXT_PUBLIC_SERVER_URL="" \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @mesa/web

# ---------- Runtime ----------
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    PORT=3010 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
# Standalone do monorepo: o servidor fica em apps/web/server.js.
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3010/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/web/server.js"]
