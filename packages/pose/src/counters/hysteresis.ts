import { PoseFrame, RepCounter, RepUpdate } from "../types";

export interface MetricSample {
  /** Scalar summarizing body position this frame; null when not trackable. */
  value: number;
  confidence: number;
}

export interface HysteresisConfig {
  /** Extract the exercise metric from a frame; null = landmarks not visible. */
  metric(frame: PoseFrame): MetricSample | null;
  /**
   * Rep apex threshold. With `apexIsLow` (push-up elbow angle) the metric must
   * drop to `apex` or below; otherwise (jumping-jack openness) it must rise to
   * `apex` or above.
   */
  apex: number;
  /** Threshold for returning to the start position, completing the rep. */
  start: number;
  apexIsLow: boolean;
  /** Cue shown when the user turns around before reaching the apex. */
  partialFeedback: string;
  /** Cue shown while landmarks are not trackable. */
  visibilityFeedback?: string;
}

/**
 * Three-state rep counter: START -> MOVING -> APEX -> (rep) START.
 * Returning to START from MOVING without touching APEX rejects the rep and
 * surfaces `partialFeedback` — this is what makes half-reps not count.
 */
export class HysteresisCounter implements RepCounter {
  private state: "start" | "moving" | "apex" = "start";

  constructor(private readonly config: HysteresisConfig) {}

  reset(): void {
    this.state = "start";
  }

  update(frame: PoseFrame): RepUpdate {
    const sample = this.config.metric(frame);
    if (!sample) {
      return {
        repCompleted: false,
        phase: "unknown",
        feedback:
          this.config.visibilityFeedback ?? "Step back so your full body is in frame",
        confidence: 0,
      };
    }

    // Normalize so that "toward apex" is always decreasing.
    const sign = this.config.apexIsLow ? 1 : -1;
    const value = sign * sample.value;
    const apex = sign * this.config.apex;
    const start = sign * this.config.start;
    // Leave START once meaningfully below it, to avoid flicker at the boundary.
    const leaveStart = start - Math.abs(start - apex) * 0.25;

    let repCompleted = false;
    let feedback: string | null = null;

    switch (this.state) {
      case "start":
        if (value <= apex) this.state = "apex";
        else if (value <= leaveStart) this.state = "moving";
        break;
      case "moving":
        if (value <= apex) {
          this.state = "apex";
        } else if (value >= start) {
          // Turned around early: partial rep, no count.
          this.state = "start";
          feedback = this.config.partialFeedback;
        }
        break;
      case "apex":
        if (value >= start) {
          this.state = "start";
          repCompleted = true;
        }
        break;
    }

    const phase = this.state === "apex" ? "down" : this.state === "moving" ? "moving" : "up";
    return { repCompleted, phase, feedback, confidence: sample.confidence };
  }
}
