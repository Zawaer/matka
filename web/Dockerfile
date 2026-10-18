# Matka web app + background worker, one image.
#   docker build -t matka web/
#   docker run -p 3000:3000 --env-file .env matka
# Migrations run on every start (idempotent, safe with several replicas).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

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
RUN addgroup -S -g 1001 matka && adduser -S -u 1001 -G matka matka
COPY --from=build --chown=matka:matka /app/.next/standalone ./
COPY --from=build --chown=matka:matka /app/.next/static ./.next/static
COPY --from=build --chown=matka:matka /app/public ./public
COPY --chown=matka:matka migrations ./migrations
COPY --chown=matka:matka scripts ./scripts
USER 1001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]
