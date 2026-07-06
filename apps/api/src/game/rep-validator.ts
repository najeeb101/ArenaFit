import { ExerciseDef } from "@arenafit/shared";

export type RepVerdict =
  | { accepted: true }
  | { accepted: false; reason: "TOO_FAST" | "LOW_CONFIDENCE" };

export const MIN_REP_CONFIDENCE = 0.4;

/** How many of the most recent accepted reps the sustained-rate check looks at. */
export const SUSTAINED_WINDOW_SIZE = 6;

/**
 * Server-side sanity check on client-reported reps. The client's pose FSM is
 * the primary counter; this guards against replayed/scripted events by
 * enforcing a humanly plausible cadence and a minimum tracking confidence.
 *
 * `recentRepTimestamps` is server-clock timestamps (oldest first) of the last
 * `SUSTAINED_WINDOW_SIZE - 1` accepted reps in this match — never client-
 * supplied, so it can't be spoofed via `clientTs`.
 */
export function validateRep(
  exercise: ExerciseDef,
  recentRepTimestamps: number[],
  nowMs: number,
  confidence: number,
): RepVerdict {
  if (confidence < MIN_REP_CONFIDENCE) {
    return { accepted: false, reason: "LOW_CONFIDENCE" };
  }

  const lastRepAtMs =
    recentRepTimestamps.length > 0 ? recentRepTimestamps[recentRepTimestamps.length - 1] : null;
  // 20% tolerance under the configured floor to absorb network batching.
  const minInterval = exercise.minRepIntervalMs * 0.8;
  if (lastRepAtMs !== null && nowMs - lastRepAtMs < minInterval) {
    return { accepted: false, reason: "TOO_FAST" };
  }

  // Single-rep tolerance alone lets a scripted/replayed sequence sit right at
  // the edge of plausibility for an entire match. A genuine human's cadence
  // has natural jitter and fatigue; a metronomic sustained pace at the floor
  // for several reps in a row is the anomaly this catches.
  if (recentRepTimestamps.length >= SUSTAINED_WINDOW_SIZE - 1) {
    const windowStart = recentRepTimestamps[recentRepTimestamps.length - (SUSTAINED_WINDOW_SIZE - 1)];
    const avgInterval = (nowMs - windowStart) / (SUSTAINED_WINDOW_SIZE - 1);
    if (avgInterval < exercise.minRepIntervalMs * 0.85) {
      return { accepted: false, reason: "TOO_FAST" };
    }
  }

  return { accepted: true };
}
