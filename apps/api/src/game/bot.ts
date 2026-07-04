import {
  ExerciseDef,
  MatchModeDef,
  OpponentSummary,
  tierForRating,
} from "@arenafit/shared";

/**
 * Simulated opponent model. Personas and rep schedules are generated up
 * front so the whole battle is deterministic given an RNG — which also makes
 * this trivially unit-testable. The gateway replays the schedule through the
 * same events a human opponent would emit (see shared/events.ts).
 */

const BOT_NAMES = [
  "IronWolf", "RepReaper", "TurboTitan", "FlexFalcon", "GritGoblin",
  "PulsePanther", "StormSquat", "BlazeBison", "NovaKnight", "RhinoRush",
  "VoltViper", "CrushCobra", "PeakPuma", "DashDingo", "MightMoose",
  "SwiftStag", "BoulderBear", "RapidRaven", "SteelStork", "PowerPike",
  "JoltJackal", "BurnBadger", "FuryFox", "TankTiger", "ZenZebra",
  "ApexAdder", "GrindGriffin", "HustleHawk", "PumpPhoenix", "SprintSpider",
];

const BOT_COUNTRIES = ["US", "BR", "DE", "JP", "KR", "GB", "FR", "ES", "MX", "TR", "IN", "SE"];

export type Rng = () => number;

export interface BotPersona extends OpponentSummary {
  userId: null;
}

export function generateBotPersona(playerRating: number, rng: Rng = Math.random): BotPersona {
  // Keep the matchup close: within ±120 rating of the player.
  const rating = Math.max(500, Math.round(playerRating + (rng() * 2 - 1) * 120));
  return {
    userId: null,
    displayName: BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)],
    rating,
    tier: tierForRating(rating).id,
    level: Math.max(1, Math.round(rating / 60 - 10 + rng() * 6)),
    country: BOT_COUNTRIES[Math.floor(rng() * BOT_COUNTRIES.length)],
  };
}

/** Higher-rated bots do more reps; clamped so battles stay winnable. */
export function skillFactor(rating: number): number {
  return Math.min(1.35, Math.max(0.6, 0.75 + (rating - 800) / 1600));
}

/**
 * Generate the millisecond offsets (from match start) at which the bot
 * completes each rep: base cadence from the exercise, scaled by skill,
 * slowed by fatigue as the match progresses, with jitter and occasional
 * short breathers.
 */
export function generateBotSchedule(
  exercise: ExerciseDef,
  mode: MatchModeDef,
  botRating: number,
  rng: Rng = Math.random,
): number[] {
  const durationMs = mode.durationSec * 1000;
  const maxReps = mode.targetReps ?? Number.POSITIVE_INFINITY;
  const baseInterval = 1000 / (exercise.baseRps * skillFactor(botRating));

  const schedule: number[] = [];
  // Humans don't start instantly.
  let t = 800 + rng() * 1200;
  while (schedule.length < maxReps) {
    const progress = t / durationMs;
    const fatigue = 1 + progress * 0.45; // up to 45% slower by the end
    const jitter = 0.85 + rng() * 0.3;
    t += baseInterval * fatigue * jitter;
    if (rng() < 0.04) t += 1000 + rng() * 1500; // breather
    if (t >= durationMs) break;
    schedule.push(Math.round(t));
  }
  return schedule;
}
