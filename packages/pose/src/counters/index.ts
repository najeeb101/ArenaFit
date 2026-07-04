import type { ExerciseId } from "@arenafit/shared";
import { RepCounter } from "../types";
import { createJumpingJackCounter } from "./jumpingJack";
import { createPlankCounter } from "./plank";
import { createPushupCounter } from "./pushup";
import { createSquatCounter } from "./squat";

export * from "./hysteresis";
export * from "./jumpingJack";
export * from "./plank";
export * from "./pushup";
export * from "./squat";

export function createCounter(exercise: ExerciseId): RepCounter {
  switch (exercise) {
    case "PUSHUP":
      return createPushupCounter();
    case "SQUAT":
      return createSquatCounter();
    case "JUMPING_JACK":
      return createJumpingJackCounter();
    case "PLANK":
      return createPlankCounter();
  }
}
