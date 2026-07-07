# ArenaFit

**Compete. Improve. Dominate.**

Live 1v1 fitness battles in the browser: get matched, turn on your camera, and
out-rep your opponent while AI counts every clean rep. Elo ranked ladder,
XP/levels/coins, achievements, daily streaks, leaderboards.

Milestone 1 ships the full core loop against a simulated opponent, plus real
human-vs-human matches via private rooms (share a code, no bot involved).
Public matchmaking against a human, and WebRTC video, are Milestone 2 — see
[docs/architecture.md](docs/architecture.md).

## Stack

- **Web**: Next.js 15, React 19, TypeScript, Tailwind v4, Framer Motion, Socket.IO client
- **Pose AI**: MediaPipe PoseLandmarker (on-device), custom rep-counting FSMs (`packages/pose`)
- **API**: NestJS 11, Prisma, Socket.IO, JWT (access + rotating refresh)
- **DB**: SQLite for zero-setup dev (Postgres-portable schema; `docker-compose.yml` provided)

## Quick start

Prereqs: Node ≥ 20, pnpm ≥ 9. (No Docker needed for dev.)

```bash
pnpm install
pnpm db:migrate      # creates apps/api/prisma/dev.db
pnpm db:seed         # 12 achievements + 40 ladder players
pnpm dev             # web http://localhost:3000 · api http://localhost:3001
```

Then open http://localhost:3000, create an account, hit **Find Match**, allow
the camera, and do real push-ups — the AI referee counts them while your
opponent scores live.

> Pose tracking downloads the MediaPipe WASM + model from CDN on first battle,
> so the first match needs internet access. Camera video never leaves your
> browser in solo mode.

## Commands

| Command | What |
| --- | --- |
| `pnpm dev` | Both apps in watch mode (Turborepo) |
| `pnpm test` | Unit tests: rep FSMs, Elo/XP math, bot model, rep validation |
| `pnpm build` | Production builds |
| `pnpm db:migrate` / `db:seed` | Prisma migrate / seed |
| `pnpm lint` / `pnpm typecheck` | Lint / typecheck both apps |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck, build, and test on every push/PR to `main`, then builds and pushes both Docker images to GHCR on push to `main`.

## Deploy

```bash
docker compose up --build   # full stack: postgres, redis, api, web
```

Web targets Vercel (`apps/web/vercel.json`, Root Directory = `apps/web`); the
API needs a host that keeps a process alive for Socket.IO (Fly.io, Railway,
Render, or the Dockerfile on any VPS) — see
[docs/architecture.md#deployment](docs/architecture.md#deployment).

## Repo map

```
apps/web        Next.js UI (landing, auth, home, battle, profile, leaderboard, settings)
apps/api        NestJS REST + Socket.IO match engine
packages/shared game constants, Elo/XP/tiers, typed socket contracts
packages/pose   MediaPipe wrapper + per-exercise rep-counting FSMs (unit-tested)
docs/           architecture, database, api, algorithms
```

## Docs

- [Architecture & roadmap](docs/architecture.md)
- [Database schema](docs/database.md)
- [API + socket protocol](docs/api.md)
- [Algorithms (rep counting, bot, Elo/XP)](docs/algorithms.md)
