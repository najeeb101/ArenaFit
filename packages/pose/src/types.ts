/** Normalized landmark as produced by MediaPipe Pose (x/y in 0..1, y grows downward). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/** One frame of the 33-point MediaPipe pose model. */
export interface PoseFrame {
  landmarks: Landmark[];
  timestampMs: number;
}

/** MediaPipe Pose landmark indices used by ArenaFit. */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export const VISIBILITY_THRESHOLD = 0.5;

export interface RepUpdate {
  /** True exactly on the frame that completes a rep (or a valid plank second). */
  repCompleted: boolean;
  phase: "up" | "down" | "moving" | "unknown";
  /** Live coaching cue, or null when form is fine. */
  feedback: string | null;
  /** Mean visibility of the landmarks this exercise depends on, 0..1. */
  confidence: number;
}

export interface RepCounter {
  update(frame: PoseFrame): RepUpdate;
  reset(): void;
}
