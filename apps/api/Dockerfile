# Build context is the repo root (pnpm workspace) — see docker-compose.yml,
# or build standalone with: docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS base
RUN corepack enable
# Prisma's query engine links against OpenSSL at runtime.
RUN apk add --no-cache openssl
WORKDIR /app

# A pnpm workspace install needs every member's package.json present to
# match the lockfile, so the build stage copies the whole monorepo rather
# than trying to cherry-pick just this app's files.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @arenafit/shared build
RUN pnpm --filter @arenafit/api db:generate
RUN pnpm --filter @arenafit/api build

# The final image only needs this app + its one workspace dependency —
# apps/web and packages/pose are left behind here.
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3001
# Applies any pending migrations against DATABASE_URL before booting —
# safe to run on every start (no-op if the schema is already current).
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
