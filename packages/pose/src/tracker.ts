import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { Landmark, PoseFrame } from "./types";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type FrameCallback = (frame: PoseFrame) => void;

/**
 * Browser-only wrapper around MediaPipe PoseLandmarker: owns the camera
 * stream and the per-frame detection loop, and emits normalized PoseFrames.
 */
export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private lastVideoTime = -1;
  private onFrame: FrameCallback | null = null;

  async init(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = this.stream;
    await video.play();
  }

  start(onFrame: FrameCallback): void {
    this.onFrame = onFrame;
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      const video = this.video;
      const landmarker = this.landmarker;
      if (!video || !landmarker || video.readyState < 2) return;
      if (video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = video.currentTime;

      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const first = result.landmarks[0];
      if (!first) return;
      const landmarks: Landmark[] = first.map((l) => ({
        x: l.x,
        y: l.y,
        z: l.z,
        visibility: l.visibility ?? 0,
      }));
      this.onFrame?.({ landmarks, timestampMs: now });
    };
    loop();
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.onFrame = null;
  }

  destroy(): void {
    this.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = null;
  }
}
