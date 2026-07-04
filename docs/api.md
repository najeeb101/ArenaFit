# API surface

Base URL: `http://localhost:3001`. All protected routes take
`Authorization: Bearer <accessToken>`.

## REST

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | `{email, username, password}` → `{user, tokens}` |
| POST | `/auth/login` | — | `{identifier, password}` (email or username) → `{user, tokens}` |
| POST | `/auth/refresh` | — | `{refreshToken}` → `{tokens}` (rotates the refresh token) |
| POST | `/auth/logout` | — | `{refreshToken}` → 204 (revokes it) |
| GET | `/users/me/profile` | ✓ | `ProfileDto` (rating, tier, xp/level, streaks, W/L, …) |
| PATCH | `/users/me/profile` | ✓ | `{displayName?, country?}` → `ProfileDto` |
| GET | `/users/me/matches?limit=` | ✓ | `MatchHistoryItemDto[]` |
| GET | `/users/me/rating-history` | ✓ | `RatingPointDto[]` |
| GET | `/users/me/achievements` | ✓ | `AchievementDto[]` (locked + unlocked) |
| GET | `/leaderboard?board=global\|weekly` | ✓ | `LeaderboardEntryDto[]` (top 50) |

Validation is zod-based; errors return `400 {message, errors[]}`.

## Socket.IO

Connect with `io(API_URL, { auth: { token: accessToken } })`. Unauthenticated
sockets are disconnected. Full typed contract:
`packages/shared/src/events.ts`.

Client → server:

| Event | Payload | Notes |
| --- | --- | --- |
| `queue:join` | `{exercise, mode}` | Enters matchmaking (2–8 s simulated wait in M1) |
| `queue:leave` | — | Cancels the search |
| `match:ready` | `{matchId}` | Sent after camera pose verification passes |
| `rep:completed` | `{matchId, clientTs, confidence}` | One per locally counted rep |
| `match:forfeit` | `{matchId}` | Counts as a loss once the match started |

Server → client:

| Event | Payload |
| --- | --- |
| `queue:status` | `{position, elapsedSec}` |
| `match:found` | `{matchId, exercise, mode, durationSec, targetReps, opponent}` |
| `match:countdown` | `{matchId, value}` (3, 2, 1) |
| `match:start` | `{matchId, startedAt, durationSec, targetReps}` |
| `score:update` | `{matchId, you, opponent}` |
| `rep:rejected` | `{matchId, reason: TOO_FAST \| LOW_CONFIDENCE \| MATCH_NOT_ACTIVE}` |
| `match:end` | `{matchId, reason, you: {reps, outcome, xp, coins, rating…, unlockedAchievements}, opponentReps}` |
| `error:game` | `{message}` |

Disconnecting mid-match persists the result as an abandoned loss.
