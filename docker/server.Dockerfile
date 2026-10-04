# Servidor da mesa (Express + Socket.IO + Prisma). Build do monorepo inteiro:
# o tsup empacota os pacotes @mesa/* no dist; o resto vem de node_modules.

# ---------- Build ----------
FROM node:22-alpine AS builder
WORKDIR /repo

# Só os manifests primeiro: a camada do npm ci fica em cache enquanto as
# dependências não mudam.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/protocol/package.json packages/protocol/
COPY packages/rules/package.json packages/rules/
COPY packages/srd/package.json packages/srd/
# --ignore-scripts: o postinstall (prisma generate) precisa do schema, que só
# chega no COPY abaixo; o build roda o generate.
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build -w @mesa/server

# Só as dependências de produção do servidor (inclui a CLI do Prisma).
RUN rm -rf node_modules && npm ci --omit=dev --ignore-scripts -w @mesa/server --include-workspace-root=false

# ---------- Runtime ----------
FROM node:22-alpine AS runner

# tini: repassa SIGTERM ao node (o servidor fecha o Socket.IO e o Prisma).
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=4010 \
    ASSETS_DIR=/data/assets

WORKDIR /app
COPY --from=builder --chown=node:node /repo/node_modules ./node_modules
COPY --from=builder --chown=node:node /repo/apps/server/package.json ./package.json
COPY --from=builder --chown=node:node /repo/apps/server/dist ./dist
COPY --from=builder --chown=node:node /repo/apps/server/prisma ./prisma
COPY --from=builder --chown=node:node /repo/apps/server/prisma.config.ts ./prisma.config.ts

# Volume das imagens enviadas: nasce com o dono certo.
RUN mkdir -p /data/assets && chown node:node /data/assets
VOLUME ["/data/assets"]

USER node
EXPOSE 4010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4010) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
# Migrações pendentes antes de abrir a porta (idempotente; sem pendência é rápido).
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]
