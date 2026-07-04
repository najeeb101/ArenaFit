import { ExerciseDef } from "@arenafit/shared";

export type RepVerdict =
  | { accepted: true }
  | { accepted: false; reason: "TOO_FAST" | "LOW_CONFIDENCE" };

export const MIN_REP_CONFIDENCE = 0.4;

/**
 * Server-side sanity check on client-reported reps. The client's pose FSM is
 * the primary counter; this guards against replayed/scripted events by
 * enforcing a humanly plausible cadence and a minimum tracking confidence.
 */
export function validateRep(
  exercise: ExerciseDef,
  lastRepAtMs: number | null,
  nowMs: number,
  confidence: number,
): RepVerdict {
  if (confidence < MIN_REP_CONFIDENCE) {
    return { accepted: false, reason: "LOW_CONFIDENCE" };
  }
  // 20% tolerance under the configured floor to absorb network batching.
  const minInterval = exercise.minRepIntervalMs * 0.8;
  if (lastRepAtMs !== null && nowMs - lastRepAtMs < minInterval) {
    return { accepted: false, reason: "TOO_FAST" };
  }
  return { accepted: true };
}
