# Matka web app + background worker, one image.
#   docker build -t matka web/
#   docker run -p 3000:3000 --env-file .env matka
# Migrations run on every start (idempotent, safe with several replicas).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# claude-accounts-client is vendored (file: dependency), so it has to be here for npm ci.
COPY vendor ./vendor
RUN npm ci \
 && mkdir -p /claude-bin && cp -r node_modules/@anthropic-ai/claude-agent-sdk-linux-* /claude-bin/

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# libgcc/libstdc++: Claude Code's musl binary (AI place picker) links against them.
RUN apk add --no-cache libgcc libstdc++ \
 && addgroup -S -g 1001 matka && adduser -S -u 1001 -G matka matka
COPY --from=build --chown=matka:matka /app/.next/standalone ./
COPY --from=build --chown=matka:matka /app/.next/static ./.next/static
# Claude Code's native binary for the optional AI place picker (lib/claude.ts):
# the SDK looks it up at runtime, so the standalone trace doesn't include it.
COPY --from=deps --chown=matka:matka /claude-bin/ ./node_modules/@anthropic-ai/
COPY --from=build --chown=matka:matka /app/public ./public
COPY --chown=matka:matka migrations ./migrations
COPY --chown=matka:matka scripts ./scripts
COPY --chown=matka:matka data ./data
USER 1001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]
