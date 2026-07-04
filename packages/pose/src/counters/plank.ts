import { bilateralAngle } from "../geometry";
import { LM, PoseFrame, RepCounter, RepUpdate } from "../types";

/**
 * Time-based counter: emits one "rep" per full second of valid plank hold.
 * Valid = shoulder-hip-ankle near a straight line AND the body horizontal
 * (rules out simply standing up straight).
 */
export class PlankCounter implements RepCounter {
  private heldMs = 0;
  private lastTs: number | null = null;
  private emittedSeconds = 0;

  reset(): void {
    this.heldMs = 0;
    this.lastTs = null;
    this.emittedSeconds = 0;
  }

  update(frame: PoseFrame): RepUpdate {
    const l = frame.landmarks;
    const alignment = bilateralAngle([
      [l[LM.LEFT_SHOULDER], l[LM.LEFT_HIP], l[LM.LEFT_ANKLE]],
      [l[LM.RIGHT_SHOULDER], l[LM.RIGHT_HIP], l[LM.RIGHT_ANKLE]],
    ]);

    const dt = this.lastTs === null ? 0 : Math.min(frame.timestampMs - this.lastTs, 250);
    this.lastTs = frame.timestampMs;

    if (!alignment) {
      return {
        repCompleted: false,
        phase: "unknown",
        feedback: "Get side-on to the camera, full body in frame",
        confidence: 0,
      };
    }

    const shoulderY = (l[LM.LEFT_SHOULDER].y + l[LM.RIGHT_SHOULDER].y) / 2;
    const hipY = (l[LM.LEFT_HIP].y + l[LM.RIGHT_HIP].y) / 2;
    const ankleY = (l[LM.LEFT_ANKLE].y + l[LM.RIGHT_ANKLE].y) / 2;
    const horizontal = Math.abs(shoulderY - ankleY) < 0.3;
    const straight = alignment.angle >= 155;
    const hipsHigh = hipY <= Math.max(shoulderY, ankleY) + 0.12;

    let feedback: string | null = null;
    if (!horizontal) feedback = "Get into plank position";
    else if (!straight) feedback = "Straighten your body — one line from head to heels";
    else if (!hipsHigh) feedback = "Lift your hips";

    const holding = horizontal && straight && hipsHigh;
    if (holding) this.heldMs += dt;

    let repCompleted = false;
    if (Math.floor(this.heldMs / 1000) > this.emittedSeconds) {
      this.emittedSeconds++;
      repCompleted = true;
    }

    return {
      repCompleted,
      phase: holding ? "down" : "up",
      feedback,
      confidence: alignment.confidence,
    };
  }
}

export function createPlankCounter(): PlankCounter {
  return new PlankCounter();
}
