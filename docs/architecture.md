# ArenaFit — Architecture

## Overview

ArenaFit is a mobile-first web app for live 1v1 fitness battles with AI rep counting.
Milestone 1 ships the full core loop against a **simulated opponent** via public
matchmaking: real camera + on-device pose tracking, a server-authoritative match
engine, Elo ratings, XP/levels/coins, achievements, streaks, and leaderboards.
On top of that, **private rooms already give real human-vs-human matches** —
a shareable invite code pairs two real players through the same match engine
(no bot involved); public matchmaking against another human still needs the
Redis-backed queue described in the roadmap below.

```
┌─────────────────────────────┐         REST (JWT)          ┌──────────────────────────┐
│  apps/web (Next.js 15)      │ ──────────────────────────▶ │  apps/api (NestJS)       │
│  - MediaPipe PoseLandmarker │                             │  - auth (access+refresh) │
│  - rep-counting FSMs        │      Socket.IO (JWT)        │  - match engine (memory) │
│  - battle UI state machine  │ ◀─────────────────────────▶ │  - bot opponent model    │
└─────────────────────────────┘   queue/score/end events    │  - progression (Elo/XP)  │
                                                            │  - Prisma ─▶ SQLite/PG   │
                                                            └──────────────────────────┘
```

## Monorepo layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js 15 App Router UI (Tailwind v4, shadcn-style components, Framer Motion) |
| `apps/api` | NestJS REST + Socket.IO gateway, Prisma ORM |
| `packages/shared` | Game constants, Elo/XP/tier math, typed socket event contracts, REST DTO types |
| `packages/pose` | Browser pose engine: MediaPipe wrapper, per-exercise rep FSMs, verification, skeleton renderer |
| `docs` | This documentation |

## Key decisions

**Pose inference runs on the client.** `@mediapipe/tasks-vision` PoseLandmarker
(lite model, GPU delegate) processes webcam frames in the browser. Camera video
never leaves the device in solo battles; only discrete rep events
(`{matchId, clientTs, confidence}`) go to the server. This eliminates GPU
server cost and keeps latency at rAF speed.

**The server is authoritative over match state.** The NestJS match engine owns
timers, scores, and results. Client rep events are validated against a
per-exercise minimum interval (superhuman cadence is dropped) and a minimum
landmark-visibility confidence. Rewards (Elo/XP/coins/achievements) are computed
only server-side, inside one Prisma transaction.

**The simulated opponent speaks the same protocol a human would.** The bot is a
persona (name/rating/tier near the player's rating) plus a pre-generated rep
schedule (base cadence × skill factor × fatigue × jitter). The gateway replays
it through the same `score:update` events. A match's participants are modeled
generically (`Participant`, a human-or-bot union in `match-engine.service.ts`)
rather than special-casing the bot, so private rooms just create two
`HumanParticipant`s instead of one — the battle client does not change either
way.

**Match state is in-memory for M1.** One API node holds active matches in a
`Map`. This is deliberate: no Redis dependency until multi-node matchmaking
(M2), at which point queue + live match state move to Redis and leaderboards
move to sorted sets.

## Dev infrastructure

The dev machine had no Docker/Postgres/Redis, so local dev runs **SQLite**
(`apps/api/.env → DATABASE_URL="file:./dev.db"`). The Prisma schema avoids
SQLite-only features; enum-like columns are strings validated by
`@arenafit/shared` types.

To switch to production-parity infra:

1. Install Docker Desktop, run `docker compose up -d` (Postgres 16 + Redis 7).
2. In `apps/api/prisma/schema.prisma` set `provider = "postgresql"`.
3. Set `DATABASE_URL="postgresql://arenafit:arenafit@localhost:5432/arenafit"`.
4. `pnpm --filter @arenafit/api exec prisma migrate dev` (fresh migration history).

## Deployment

- **API** (`apps/api/Dockerfile`): multi-stage build, `prisma migrate deploy`
  runs on container start before the server boots. Needs `DATABASE_URL`
  pointed at a real Postgres instance (SQLite is dev-only) plus the JWT
  secrets — see `.env.example`.
- **Web** (`apps/web/Dockerfile`): plain `next start`, not standalone output —
  standalone's build-time symlink tracing fails on Windows without Developer
  Mode, so this trades a larger image for zero platform-specific risk.
  `NEXT_PUBLIC_API_URL` is a *build-time* arg (inlined into the client
  bundle), not a runtime env var.
- Vercel is the intended target for web (`apps/web/vercel.json`, project
  "Root Directory" = `apps/web`); the API needs a host that runs a
  long-lived process for Socket.IO, not serverless functions (Fly.io,
  Railway, Render, or a VPS via `docker-compose.yml`).
- CI (`.github/workflows/ci.yml`) builds and pushes both images to GHCR on
  every push to `main`, after lint/typecheck/build/test all pass.
- `docker compose up --build` runs the full stack (Postgres, Redis, api,
  web) locally for testing the containerized path — day-to-day dev still
  uses `pnpm dev` against SQLite.
- None of the Dockerfiles have been verified with an actual `docker build`
  in this environment (no Docker available) — CI's first run against them
  is the first real test.

## Roadmap

- **M2 — humans**: Redis-backed public matchmaking queue (private rooms
  already work without it), WebRTC P2P video (Socket.IO signaling groundwork
  exists in `webrtc-relay.ts`; coturn TURN still needed for restrictive NATs).
- **M3 — meta**: tournaments (bracket engine), seasons + rating resets, battle
  pass, weekly missions, cosmetics shop (coins sink).
- **M4 — scale & product**: LLM AI coach on match telemetry, advanced anti-cheat
  (server-side spot-check pose verification), admin/moderation dashboard, Stripe
  premium tier, React Native app reusing `shared` + the rep FSMs.
