# Database schema

Prisma models (SQLite in dev, Postgres-portable). Source of truth:
`apps/api/prisma/schema.prisma`.

```
User ─1:1─ Profile
User ─1:N─ RefreshToken
User ─1:N─ MatchParticipant ─N:1─ Match
User ─1:N─ RatingHistory
User ─N:M─ Achievement   (via UserAchievement)
```

| Model | Purpose | Notes |
| --- | --- | --- |
| `User` | Credentials + identity | `role`: `USER \| ADMIN`. Email/username unique. |
| `RefreshToken` | Refresh-token rotation | Stores SHA-256 of the JWT; rotated on every refresh, revocable. |
| `Profile` | All progression state | `rating` (Elo), `tier`, `xp/level/coins`, W/L/D, `winStreak`, daily `currentStreak`/`longestStreak`, `totalReps`. Indexed on `rating` for the global board. |
| `Match` | One battle | `exercise`, `mode` (string ids from shared), `status`: `PENDING → ACTIVE → COMPLETED \| ABANDONED`. |
| `MatchParticipant` | One side of a battle | `userId = null` ⇒ simulated opponent (`botName`, `botRating`). Stores reps, result, ratingBefore/Delta, xp/coins earned, avg rep confidence. |
| `RatingHistory` | Elo timeline | One row per ranked result; weekly leaderboard = `SUM(delta)` over 7 days. |
| `Achievement` | Catalog | Seeded from `apps/api/src/progression/achievements.ts`. |
| `UserAchievement` | Unlocks | Unique `(userId, achievementId)`. |

Enum-like columns are strings so the schema works on SQLite; the valid values
are typed in `@arenafit/shared` and enforced by the API layer.

Commands (run in `apps/api`):

```bash
pnpm db:generate   # prisma generate
pnpm db:migrate    # prisma migrate dev
pnpm db:seed       # achievements + 40 ladder players
```
