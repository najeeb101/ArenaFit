import { bilateralAngle } from "../geometry";
import { LM, PoseFrame } from "../types";
import { HysteresisCounter, MetricSample } from "./hysteresis";

function kneeAngle(frame: PoseFrame): MetricSample | null {
  const l = frame.landmarks;
  const result = bilateralAngle([
    [l[LM.LEFT_HIP], l[LM.LEFT_KNEE], l[LM.LEFT_ANKLE]],
    [l[LM.RIGHT_HIP], l[LM.RIGHT_KNEE], l[LM.RIGHT_ANKLE]],
  ]);
  return result ? { value: result.angle, confidence: result.confidence } : null;
}

/** Rep = knees bend to ≤ 110° (thighs near parallel) then stand to ≥ 160°. */
export function createSquatCounter(): HysteresisCounter {
  return new HysteresisCounter({
    metric: kneeAngle,
    apex: 110,
    start: 160,
    apexIsLow: true,
    partialFeedback: "Sit deeper — thighs to parallel",
    visibilityFeedback: "Step back so your legs are fully visible",
  });
}
