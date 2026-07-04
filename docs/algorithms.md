# Core algorithms

## Rep counting (packages/pose)

Each exercise is a finite-state machine over a scalar **metric** extracted from
MediaPipe's 33 pose landmarks per frame:

| Exercise | Metric | Apex | Start (rep counts) |
| --- | --- | --- | --- |
| Push-up | elbow angle (shoulder–elbow–wrist, bilateral avg) | ≤ 95° | ≥ 155° |
| Squat | knee angle (hip–knee–ankle) | ≤ 110° | ≥ 160° |
| Jumping jack | arm-raise + leg-spread "openness" score | ≥ 2.7 | ≤ 1.6 |
| Plank | shoulder–hip–ankle alignment + horizontality | — (1 "rep" per valid second) | — |

The generic `HysteresisCounter` has three states: `START → MOVING → APEX →
(rep) START`. Returning from MOVING to START without touching APEX rejects the
rep and emits a coaching cue ("Go lower — chest toward the floor"). Frames
whose required landmarks fall below 0.5 visibility freeze the FSM and surface a
framing cue instead of guessing.

Pre-match verification (`PoseVerifier`) requires ~24 consecutive frames with
the full body visible before the client signals `match:ready`.

## Server-side rep validation (apps/api)

The client's FSM is the counter; the server sanity-checks every event:
- cadence: interval since last accepted rep ≥ 80% of the exercise's
  `minRepIntervalMs` (e.g. 750 ms for push-ups) — scripted spam is dropped;
- confidence: mean landmark visibility ≥ 0.4.

Rejected reps notify the client (`rep:rejected`) so the UI stays honest.

## Bot opponent

Persona: rating ~ U(player±120), tier derived, name/country sampled.
Schedule: rep timestamps generated up front —

```
interval_i = (1000 / (baseRps · skill(rating))) · fatigue(t) · jitter
skill(r)   = clamp(0.75 + (r − 800)/1600, 0.6, 1.35)
fatigue(t) = 1 + 0.45 · t/duration          (up to 45% slower at the end)
jitter     ~ U(0.85, 1.15), 4% chance of a 1–2.5 s breather
```

Because the bot's rating tracks the player's, expected outcomes hover near
50/50 and Elo stays meaningful.

## Rating, tiers, XP

- **Elo**: K = 40 (<10 games), 24 (<30), else 16; standard expected-score
  formula; floor rating 400. Draw = 0.5.
- **Tiers**: Bronze <1100 ≤ Silver <1250 ≤ Gold <1400 ≤ Platinum <1550 ≤
  Diamond <1700 ≤ Master <1900 ≤ Champion.
- **XP**: `40 + 2·min(reps,100) + 60·win (25 draw)`; coins = XP/4. Level curve
  `Σ 100·(l−1)^1.35`. Achievement rewards stack on top.
- **Streaks**: daily streak extends on consecutive local calendar days;
  win streak resets on any non-win.

All of this lives in `packages/shared` (`elo.ts`, `tiers.ts`, `xp.ts`) and is
unit-tested there; the API is the only writer.
