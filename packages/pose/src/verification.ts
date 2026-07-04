import { LM, PoseFrame, VISIBILITY_THRESHOLD } from "./types";

const REQUIRED = [
  LM.NOSE,
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
  LM.LEFT_KNEE,
  LM.RIGHT_KNEE,
  LM.LEFT_ANKLE,
  LM.RIGHT_ANKLE,
];

/**
 * Pre-match check: the player's full body must be trackable for
 * `requiredFrames` consecutive frames before the battle can start.
 */
export class PoseVerifier {
  private consecutive = 0;

  constructor(private readonly requiredFrames = 30) {}

  reset(): void {
    this.consecutive = 0;
  }

  /** Returns progress 0..1; 1 means verification passed. */
  update(frame: PoseFrame): { progress: number; verified: boolean; missing: boolean } {
    const ok =
      frame.landmarks.length > LM.RIGHT_ANKLE &&
      REQUIRED.every((i) => frame.landmarks[i].visibility >= VISIBILITY_THRESHOLD);
    this.consecutive = ok ? this.consecutive + 1 : 0;
    const progress = Math.min(this.consecutive / this.requiredFrames, 1);
    return { progress, verified: progress >= 1, missing: !ok };
  }
}
