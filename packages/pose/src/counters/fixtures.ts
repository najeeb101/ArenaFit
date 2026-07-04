import { Landmark, LM, PoseFrame } from "../types";

/** Test helpers that synthesize 33-landmark frames for specific body positions. */

export function blankFrame(timestampMs = 0, visibility = 0.95): PoseFrame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility,
  }));
  return { landmarks, timestampMs };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Place shoulder–elbow–wrist (both sides) so the elbow angle equals `angle`.
 * Shoulder sits along -x from the elbow; the wrist is rotated `angle` degrees
 * from that direction.
 */
export function pushupFrame(angle: number, timestampMs: number): PoseFrame {
  const frame = blankFrame(timestampMs);
  for (const [shoulder, elbow, wrist] of [
    [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
    [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  ] as const) {
    const e = { x: 0.5, y: 0.5 };
    frame.landmarks[elbow] = { ...frame.landmarks[elbow], ...e };
    frame.landmarks[shoulder] = { ...frame.landmarks[shoulder], x: e.x - 0.2, y: e.y };
    const dir = rad(180 - angle);
    frame.landmarks[wrist] = {
      ...frame.landmarks[wrist],
      x: e.x + 0.2 * Math.cos(dir),
      y: e.y + 0.2 * Math.sin(dir),
    };
  }
  return frame;
}

/** Same construction for hip–knee–ankle. */
export function squatFrame(angle: number, timestampMs: number): PoseFrame {
  const frame = blankFrame(timestampMs);
  for (const [hip, knee, ankle] of [
    [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
    [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ] as const) {
    const k = { x: 0.5, y: 0.6 };
    frame.landmarks[knee] = { ...frame.landmarks[knee], ...k };
    frame.landmarks[hip] = { ...frame.landmarks[hip], x: k.x - 0.2, y: k.y };
    const dir = rad(180 - angle);
    frame.landmarks[ankle] = {
      ...frame.landmarks[ankle],
      x: k.x + 0.2 * Math.cos(dir),
      y: k.y + 0.2 * Math.sin(dir),
    };
  }
  return frame;
}

/** Jumping jack: openness 0..1 interpolates closed -> arms overhead + legs wide. */
export function jackFrame(openness: number, timestampMs: number): PoseFrame {
  const frame = blankFrame(timestampMs);
  const t = openness;
  const set = (i: number, x: number, y: number) => {
    frame.landmarks[i] = { ...frame.landmarks[i], x, y };
  };
  set(LM.LEFT_SHOULDER, 0.42, 0.35);
  set(LM.RIGHT_SHOULDER, 0.58, 0.35);
  set(LM.LEFT_HIP, 0.45, 0.55);
  set(LM.RIGHT_HIP, 0.55, 0.55);
  // Wrists: at hips (y=0.55) when closed, overhead (y=0.15) when open.
  const wristY = 0.55 - 0.4 * t;
  set(LM.LEFT_WRIST, 0.4 - 0.1 * t, wristY);
  set(LM.RIGHT_WRIST, 0.6 + 0.1 * t, wristY);
  // Ankles: hip-width when closed, wide when open.
  const spread = 0.05 + 0.25 * t;
  set(LM.LEFT_ANKLE, 0.5 - spread, 0.9);
  set(LM.RIGHT_ANKLE, 0.5 + spread, 0.9);
  return frame;
}

/** Plank: straight horizontal body, or sagging hips when `sagging`. */
export function plankFrame(timestampMs: number, sagging = false): PoseFrame {
  const frame = blankFrame(timestampMs);
  const y = 0.6;
  const hipY = sagging ? y + 0.18 : y + 0.01;
  const set = (i: number, x: number, py: number) => {
    frame.landmarks[i] = { ...frame.landmarks[i], x, y: py };
  };
  set(LM.LEFT_SHOULDER, 0.25, y);
  set(LM.RIGHT_SHOULDER, 0.25, y);
  set(LM.LEFT_HIP, 0.5, hipY);
  set(LM.RIGHT_HIP, 0.5, hipY);
  set(LM.LEFT_ANKLE, 0.75, y + 0.02);
  set(LM.RIGHT_ANKLE, 0.75, y + 0.02);
  return frame;
}
