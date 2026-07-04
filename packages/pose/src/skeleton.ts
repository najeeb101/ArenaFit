import { Landmark, VISIBILITY_THRESHOLD } from "./types";

/** Bone pairs of the MediaPipe 33-point topology worth rendering. */
const BONES: [number, number][] = [
  [11, 12], // shoulders
  [11, 13],
  [13, 15], // left arm
  [12, 14],
  [14, 16], // right arm
  [11, 23],
  [12, 24], // torso
  [23, 24], // hips
  [23, 25],
  [25, 27], // left leg
  [24, 26],
  [26, 28], // right leg
];

/**
 * Draw a neon skeleton overlay onto a canvas sized to match the video.
 * `mirror` should match the CSS mirroring applied to the self-view video.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  options: { color?: string; mirror?: boolean } = {},
): void {
  const { color = "#22d3ee", mirror = true } = options;
  ctx.clearRect(0, 0, width, height);
  const px = (l: Landmark) => ((mirror ? 1 - l.x : l.x) * width);
  const py = (l: Landmark) => l.y * height;

  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  for (const [a, b] of BONES) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb) continue;
    if (la.visibility < VISIBILITY_THRESHOLD || lb.visibility < VISIBILITY_THRESHOLD) continue;
    ctx.beginPath();
    ctx.moveTo(px(la), py(la));
    ctx.lineTo(px(lb), py(lb));
    ctx.stroke();
  }

  ctx.fillStyle = color;
  for (const [a, b] of BONES) {
    for (const i of [a, b]) {
      const l = landmarks[i];
      if (!l || l.visibility < VISIBILITY_THRESHOLD) continue;
      ctx.beginPath();
      ctx.arc(px(l), py(l), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
}
