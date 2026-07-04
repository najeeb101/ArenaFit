export const STARTING_RATING = 1000;
export const RATING_FLOOR = 400;

/** Expected score of `a` against `b` under the Elo model. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/**
 * K-factor decays as a player accumulates ranked games so early placements
 * move fast and established ratings are stable.
 */
export function kFactor(gamesPlayed: number): number {
  if (gamesPlayed < 10) return 40;
  if (gamesPlayed < 30) return 24;
  return 16;
}

export type MatchOutcome = "WIN" | "LOSS" | "DRAW";

export function ratingDelta(
  rating: number,
  opponentRating: number,
  outcome: MatchOutcome,
  gamesPlayed: number,
): number {
  const s = outcome === "WIN" ? 1 : outcome === "DRAW" ? 0.5 : 0;
  const delta = Math.round(kFactor(gamesPlayed) * (s - expectedScore(rating, opponentRating)));
  // Never drop below the floor.
  return Math.max(delta, RATING_FLOOR - rating);
}
