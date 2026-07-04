import { distance, meanVisibility, visible } from "../geometry";
import { LM, PoseFrame } from "../types";
import { HysteresisCounter, MetricSample } from "./hysteresis";

/**
 * Openness score: arm raise (wrists relative to the hip→shoulder span) plus
 * leg spread (ankle distance relative to shoulder width).
 * Standing closed ≈ 1, fully open (arms overhead, legs wide) ≈ 3+.
 */
function openness(frame: PoseFrame): MetricSample | null {
  const l = frame.landmarks;
  const required = [
    l[LM.LEFT_SHOULDER],
    l[LM.RIGHT_SHOULDER],
    l[LM.LEFT_WRIST],
    l[LM.RIGHT_WRIST],
    l[LM.LEFT_HIP],
    l[LM.RIGHT_HIP],
    l[LM.LEFT_ANKLE],
    l[LM.RIGHT_ANKLE],
  ];
  if (!visible(...required)) return null;

  const shoulderY = (l[LM.LEFT_SHOULDER].y + l[LM.RIGHT_SHOULDER].y) / 2;
  const hipY = (l[LM.LEFT_HIP].y + l[LM.RIGHT_HIP].y) / 2;
  const wristY = (l[LM.LEFT_WRIST].y + l[LM.RIGHT_WRIST].y) / 2;
  const torso = Math.max(hipY - shoulderY, 0.05);
  // 0 = wrists at hips, 1 = wrists at shoulders, ~2 = overhead.
  const armRaise = (hipY - wristY) / torso;

  const shoulderWidth = Math.max(distance(l[LM.LEFT_SHOULDER], l[LM.RIGHT_SHOULDER]), 0.02);
  const legSpread = distance(l[LM.LEFT_ANKLE], l[LM.RIGHT_ANKLE]) / shoulderWidth;

  return { value: armRaise + legSpread, confidence: meanVisibility(required) };
}

/** Rep = open to arms-overhead + legs-wide (score ≥ 2.7), then close (≤ 1.6). */
export function createJumpingJackCounter(): HysteresisCounter {
  return new HysteresisCounter({
    metric: openness,
    apex: 2.7,
    start: 1.6,
    apexIsLow: false,
    partialFeedback: "Reach all the way overhead and jump wider",
    visibilityFeedback: "Face the camera with your whole body in frame",
  });
}
