# Build context is the repo root (pnpm workspace) — see docker-compose.yml,
# or build standalone with:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# A pnpm workspace install needs every member's package.json present to
# match the lockfile, so the build stage copies the whole monorepo rather
# than trying to cherry-pick just this app's files.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at runtime — must be supplied here, not just in the container's env.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @arenafit/shared build
# @arenafit/pose has no build step of its own — Next.js transpiles its raw
# TS source directly via transpilePackages in next.config.ts.
RUN pnpm --filter @arenafit/web build

# The final image only needs this app + its workspace dependencies —
# apps/api is left behind here.
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/pose ./packages/pose
COPY --from=build /app/apps/web ./apps/web
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
