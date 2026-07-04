import { bilateralAngle } from "../geometry";
import { LM, PoseFrame } from "../types";
import { HysteresisCounter, MetricSample } from "./hysteresis";

function elbowAngle(frame: PoseFrame): MetricSample | null {
  const l = frame.landmarks;
  const result = bilateralAngle([
    [l[LM.LEFT_SHOULDER], l[LM.LEFT_ELBOW], l[LM.LEFT_WRIST]],
    [l[LM.RIGHT_SHOULDER], l[LM.RIGHT_ELBOW], l[LM.RIGHT_WRIST]],
  ]);
  return result ? { value: result.angle, confidence: result.confidence } : null;
}

/** Rep = elbows bend to ≤ 95° then lock back out to ≥ 155°. */
export function createPushupCounter(): HysteresisCounter {
  return new HysteresisCounter({
    metric: elbowAngle,
    apex: 95,
    start: 155,
    apexIsLow: true,
    partialFeedback: "Go lower — chest toward the floor",
    visibilityFeedback: "Angle the camera so your arms are fully visible",
  });
}
