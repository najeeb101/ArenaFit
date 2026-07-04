# ArenaFit — Architecture

## Overview

ArenaFit is a mobile-first web app for live 1v1 fitness battles with AI rep counting.
Milestone 1 (this codebase) ships the full core loop against a **simulated opponent**:
real camera + on-device pose tracking, a server-authoritative match engine, Elo
ratings, XP/levels/coins, achievements, streaks, and leaderboards.

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
it through the same `score:update` events. Milestone 2 replaces the bot with a
second socket in the same room — the battle client does not change.

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

## Roadmap

- **M2 — humans**: Redis-backed matchmaking queue, WebRTC P2P video (Socket.IO
  signaling + coturn TURN), friends, private rooms, human rematches.
- **M3 — meta**: tournaments (bracket engine), seasons + rating resets, battle
  pass, weekly missions, cosmetics shop (coins sink).
- **M4 — scale & product**: LLM AI coach on match telemetry, advanced anti-cheat
  (server-side spot-check pose verification), admin/moderation dashboard, Stripe
  premium tier, React Native app reusing `shared` + the rep FSMs.
