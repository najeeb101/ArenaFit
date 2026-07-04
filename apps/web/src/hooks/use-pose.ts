"use client";

import {
  createCounter,
  drawSkeleton,
  PoseTracker,
  PoseVerifier,
  type PoseFrame,
  type RepCounter,
} from "@arenafit/pose";
import type { ExerciseId } from "@arenafit/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export type PoseMode = "off" | "verify" | "count";

export interface UsePoseResult {
  /** Attach to a <video> element (self view). */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Attach to an overlay <canvas> positioned over the video. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraState: "idle" | "starting" | "ready" | "error";
  cameraError: string | null;
  verifyProgress: number;
  verified: boolean;
  feedback: string | null;
  /** Rep count according to the local pose engine. */
  localReps: number;
}

/**
 * Owns the camera + MediaPipe pipeline for a battle. `mode` drives what each
 * frame does: pre-match full-body verification, or live rep counting (which
 * fires `onRep` with the tracking confidence for the server to validate).
 */
export function usePose(
  exercise: ExerciseId,
  mode: PoseMode,
  onRep: (confidence: number) => void,
): UsePoseResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef<PoseTracker | null>(null);
  const counterRef = useRef<RepCounter | null>(null);
  const verifierRef = useRef(new PoseVerifier(24));
  const modeRef = useRef<PoseMode>(mode);
  const onRepRef = useRef(onRep);

  const [cameraState, setCameraState] = useState<UsePoseResult["cameraState"]>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [verified, setVerified] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localReps, setLocalReps] = useState(0);

  modeRef.current = mode;
  onRepRef.current = onRep;

  const handleFrame = useCallback((frame: PoseFrame) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (canvas && video && video.videoWidth > 0) {
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) drawSkeleton(ctx, frame.landmarks, canvas.width, canvas.height);
    }

    const currentMode = modeRef.current;
    if (currentMode === "verify") {
      const result = verifierRef.current.update(frame);
      setVerifyProgress(result.progress);
      if (result.verified) setVerified(true);
      setFeedback(result.missing ? "Step back — full body in frame" : null);
    } else if (currentMode === "count" && counterRef.current) {
      const update = counterRef.current.update(frame);
      setFeedback(update.feedback);
      if (update.repCompleted) {
        setLocalReps((r) => r + 1);
        onRepRef.current(update.confidence);
      }
    }
  }, []);

  // Start/stop the camera pipeline whenever mode leaves/enters "off".
  useEffect(() => {
    if (mode === "off") return;
    if (trackerRef.current) return; // already running

    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    setCameraState("starting");
    const tracker = new PoseTracker();
    trackerRef.current = tracker;

    tracker
      .init(video)
      .then(() => {
        if (cancelled) return;
        setCameraState("ready");
        tracker.start(handleFrame);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCameraState("error");
        setCameraError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access and retry."
            : "Could not start the camera / pose engine. Check your connection and retry.",
        );
      });

    return () => {
      cancelled = true;
      tracker.destroy();
      trackerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode !== "off"]);

  // Fresh counter each time counting starts.
  useEffect(() => {
    if (mode === "count") {
      counterRef.current = createCounter(exercise);
      setLocalReps(0);
    }
  }, [mode, exercise]);

  return {
    videoRef,
    canvasRef,
    cameraState,
    cameraError,
    verifyProgress,
    verified,
    feedback,
    localReps,
  };
}
