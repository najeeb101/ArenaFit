export type ExerciseId = "PUSHUP" | "SQUAT" | "JUMPING_JACK" | "PLANK";

export interface ExerciseDef {
  id: ExerciseId;
  name: string;
  /** Short instruction shown before the battle. */
  setup: string;
  /** Emoji used as a lightweight icon across the UI. */
  icon: string;
  /**
   * A "rep" for time-based exercises (plank) is one full second of valid hold.
   */
  timeBased: boolean;
  /**
   * Server-side anti-cheat: the fastest interval between two reps a human
   * can plausibly sustain. Rep events arriving faster are dropped.
   */
  minRepIntervalMs: number;
  /** Baseline reps per second used by the bot pacing model. */
  baseRps: number;
  /** Rough calories per rep, used for post-match stats. */
  caloriesPerRep: number;
}

export const EXERCISES: Record<ExerciseId, ExerciseDef> = {
  PUSHUP: {
    id: "PUSHUP",
    name: "Push-Ups",
    setup: "Side-on to the camera, full body in frame, arms locked out to start.",
    icon: "\u{1F4AA}",
    timeBased: false,
    minRepIntervalMs: 750,
    baseRps: 0.55,
    caloriesPerRep: 0.45,
  },
  SQUAT: {
    id: "SQUAT",
    name: "Squats",
    setup: "Side-on to the camera, full body in frame, stand tall to start.",
    icon: "\u{1F9B5}",
    timeBased: false,
    minRepIntervalMs: 850,
    baseRps: 0.5,
    caloriesPerRep: 0.4,
  },
  JUMPING_JACK: {
    id: "JUMPING_JACK",
    name: "Jumping Jacks",
    setup: "Face the camera, full body in frame, arms at your sides.",
    icon: "⭐",
    timeBased: false,
    minRepIntervalMs: 400,
    baseRps: 1.1,
    caloriesPerRep: 0.25,
  },
  PLANK: {
    id: "PLANK",
    name: "Plank",
    setup: "Side-on to the camera, forearms down, body in a straight line.",
    icon: "\u{1F6E1}️",
    timeBased: true,
    minRepIntervalMs: 900,
    baseRps: 1,
    caloriesPerRep: 0.08,
  },
};

export const EXERCISE_IDS = Object.keys(EXERCISES) as ExerciseId[];

export type MatchModeId = "TIMED_30" | "TIMED_60" | "FIRST_TO_25";

export interface MatchModeDef {
  id: MatchModeId;
  name: string;
  description: string;
  /** Hard time cap; for target-based modes the race usually ends sooner. */
  durationSec: number;
  targetReps: number | null;
}

export const MATCH_MODES: Record<MatchModeId, MatchModeDef> = {
  TIMED_30: {
    id: "TIMED_30",
    name: "Blitz · 30s",
    description: "Most reps in 30 seconds wins.",
    durationSec: 30,
    targetReps: null,
  },
  TIMED_60: {
    id: "TIMED_60",
    name: "Standard · 60s",
    description: "Most reps in 60 seconds wins.",
    durationSec: 60,
    targetReps: null,
  },
  FIRST_TO_25: {
    id: "FIRST_TO_25",
    name: "Sprint · First to 25",
    description: "First player to hit 25 clean reps wins.",
    durationSec: 120,
    targetReps: 25,
  },
};

export const MATCH_MODE_IDS = Object.keys(MATCH_MODES) as MatchModeId[];

export function isValidPairing(exercise: ExerciseId, mode: MatchModeId): boolean {
  // A race to 25 seconds of plank is just a 25s timed hold — disallow to keep
  // modes meaningful.
  if (exercise === "PLANK" && mode === "FIRST_TO_25") return false;
  return true;
}
