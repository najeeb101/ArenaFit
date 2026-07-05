ArenaFit Roadmap: M1 → M2
Context
Milestone 1 is complete and solid: full core loop against a simulated bot opponent, real camera-based rep counting (MediaPipe), server-authoritative Elo/XP/coins/achievements, leaderboards, 26 passing unit tests, zero TODOs/FIXMEs in the codebase. The landing-page UI was just de-AI-ified (Merriweather serif, glow effects removed, commit ba88e0a).

The user wants to pursue five initiatives, not pick one:

(A) UI polish — accessibility, mobile responsiveness, bundle/perf
(B) M2 infrastructure — Redis-backed match state, symmetric human-vs-human participant model, WebRTC groundwork
(C) Social layer — friends, private rooms, real rematch
(D) Test & deploy — playtest the full flow, CI, Dockerize, ship
(E) Bug audit / anti-cheat — disconnect handling, rep-validation gaps
This plan sequences all five rather than doing them in isolation, because several are entangled: E's worst bugs live in the exact file B must rewrite anyway (fixing twice is wasted work), and C only becomes meaningful once B gives it real opponents to be social about. D is split into a thin continuous thread (playtest after every phase) plus a final hardening pass, rather than saved entirely for the end — waiting to test until everything is "done" is how milestone-scale regressions hide.

Findings that shape this plan
apps/api/src/game/match-engine.service.ts holds all match state in three plain JS Maps (matches, queueTimers, byConnection), explicitly commented "in-memory by design for M1 (single node)." The bot is special-cased directly into ActiveMatch (botReps/botSchedule/ botCursor/botParticipantId) rather than modeled as one of a generic participants[] — this is the core blocker for B.
docker-compose.yml already provisions postgres:16-alpine + redis:7-alpine (currently unused; dev runs SQLite). No Dockerfiles exist for either app. No CI (.github/workflows doesn't exist). No lint/typecheck npm scripts in either apps/web/package.json or apps/api/package.json.
Disconnect handling (handleDisconnect, match-engine.service.ts) always scores the disconnecting player a hard LOSS with no grace period. MatchEndPayload's "OPPONENT_LEFT" reason exists in packages/shared/src/events.ts but is never produced server-side — dead code today, needed once B lands.
apps/api/src/game/rep-validator.ts only checks a confidence floor (0.4) and per-rep minimum interval (80% of minRepIntervalMs) — trusts client-computed confidence entirely, no cross-match anomaly detection.
Social features are 100% greenfield except one stub: the "rematch" button in apps/web/src/app/(app)/battle/page.tsx already exists but calls window.location.reload() — no real rematch-to-opponent logic.
Zero aria-/role=/alt= usage anywhere in apps/web/src. ~25 responsive-breakpoint usages across 7 files. Dark-only theme (no toggle).
No one has actually played a full battle end-to-end this session (camera → MediaPipe rep counting → score → match end) — only curl/API-level checks.
Phased plan
Phase 0 — Baseline hygiene (small)
Add lint + typecheck scripts to apps/web/package.json and apps/api/package.json; wire into turbo.json pipeline.
Scaffold .github/workflows/ci.yml: pnpm build && pnpm test + new lint/typecheck steps.
Playtest: register → queue → allow camera → do real reps → confirm MediaPipe counts them → match ends → rewards apply. This is the first human-driven run of pose tracking — expect to learn something here before building further on top of it.
Checkpoint: green CI, written confirmation of one clean human-played match.
Phase 1 — UI polish & accessibility (medium)
Add aria-labels/roles/alt text to the battle UI first (countdown, score, camera overlay) since it's the highest-stakes interactive surface, then the rest of apps/web/src/app/(app)/*.
Expand responsive breakpoints beyond the current ~25 usages.
Consider eslint-plugin-jsx-a11y so this doesn't regress silently.
Checkpoint: keyboard-only + screen-reader walkthrough of queue → battle → results; Lighthouse a11y score recorded before/after.
Phase 2 — Bug audit & anti-cheat (medium-large)
Files: match-engine.service.ts, rep-validator.ts, events.ts.

Add a reconnect grace window in handleDisconnect instead of immediate end(match, "YOU_LEFT").
Add a heartbeat/stale-connection timeout so a silently-hung socket eventually resolves instead of hanging the match forever.
Harden validateRep with cumulative-match anomaly detection (reject implausible sustained rep rates), short of full landmark re-derivation (deferred — needs raw landmark payloads not currently sent to the server).
Note: true OPPONENT_LEFT handling can't be fully finished until Phase 3's participant model exists — do the disconnect/stall/validator hardening now, revisit the human-leaves case after Phase 3.
Checkpoint: new tests (extending the existing 26) for grace-period reconnect and a rejected scripted/replayed rep sequence.
Phase 3 — M2 infrastructure: Redis + symmetric participants + WebRTC groundwork (large, highest uncertainty)
Files: match-engine.service.ts (core rewrite), docker-compose.yml (activate), new Dockerfiles for both apps, events.ts (extend only if the symmetric model needs new payload shapes).

Step 1: refactor ActiveMatch to a generic participants: Participant[] (bot becomes one implementation of a participant), prove all existing tests still pass with bot-as-participant before touching infra.
Step 2: swap the in-memory Maps for Redis-backed state — needed for multi-node and for surviving a node restart mid-match. This reopens the disconnect story from Phase 2 (Redis connection loss mid-match is a new failure mode) — expect to revisit that logic here.
Step 3: only then start WebRTC signaling (pure greenfield — gateway events, coturn TURN config), since it needs two real connections to signal between.
Checkpoints: (1) bot-vs-symmetric-participant refactor green on existing tests, (2) two local browser tabs complete a real human-vs-human match via Redis-backed state, (3) basic WebRTC video connects between two local peers (no TURN yet).
Phase 4 — Social layer (medium-large, depends on Phase 3)
Files: new Prisma models for friends/private rooms (greenfield), apps/web/src/app/(app)/battle/page.tsx (replace the reload-stub rematch with real rematch-to-same-opponent), landing page copy (make the "soon" claims real).

Consider shipping a "private room vs bot" / invite-link version as an earlier sub-milestone that doesn't require Phase 3 to be fully done, if we want a demoable win sooner.
Checkpoint: two accounts add each other, start a private match, rematch without a page reload.
Phase 5 — Test & deploy hardening (medium)
Files: Dockerfiles (finalize from Phase 3 drafts), vercel.json for web, .github/workflows/ci.yml (extend to build/push images), root .env.example (verify it still matches reality).

Full regression playtest across both the bot path and the human-vs-human path.
Checkpoint: a deployed staging environment where a human completes one full bot match and one full human-vs-human match successfully.
Verification approach throughout
Run pnpm test after every phase — the existing 26 tests are the regression floor; each phase should add tests for its own new logic (grace-period reconnect, anomaly detection, participant model, etc.).
Playtest manually via the dev servers (pnpm dev, web on the printed port, api on 3001) at the end of every phase, not just at the very end — Phase 0's playtest sets the baseline to compare against.
For Phase 3 specifically: verify with two real browser tabs/sessions, not just unit tests, since the whole point is symmetric human behavior that a bot-shaped test can't fully exercise.