import { Landmark, VISIBILITY_THRESHOLD } from "./types";

/** Interior angle at vertex `b` formed by points a-b-c, in degrees (0..180). */
export function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function visible(...landmarks: Landmark[]): boolean {
  return landmarks.every((l) => l.visibility >= VISIBILITY_THRESHOLD);
}

export function meanVisibility(landmarks: Landmark[]): number {
  if (landmarks.length === 0) return 0;
  return landmarks.reduce((s, l) => s + l.visibility, 0) / landmarks.length;
}

/**
 * Average an angle across left/right body sides, using only sides whose
 * landmarks are visible. Returns null when neither side is trackable.
 */
export function bilateralAngle(
  sides: [Landmark, Landmark, Landmark][],
): { angle: number; confidence: number } | null {
  const usable = sides.filter((s) => visible(...s));
  if (usable.length === 0) return null;
  const angle = usable.reduce((s, side) => s + angleDeg(...side), 0) / usable.length;
  const confidence = meanVisibility(usable.flat());
  return { angle, confidence };
}
