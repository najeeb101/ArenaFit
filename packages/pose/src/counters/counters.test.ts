import { describe, expect, it } from "vitest";
import { PoseFrame } from "../types";
import { PoseVerifier } from "../verification";
import { blankFrame, jackFrame, plankFrame, pushupFrame, squatFrame } from "./fixtures";
import { createJumpingJackCounter } from "./jumpingJack";
import { createPlankCounter } from "./plank";
import { createPushupCounter } from "./pushup";
import { createSquatCounter } from "./squat";

function countReps(counter: { update(f: PoseFrame): { repCompleted: boolean } }, frames: PoseFrame[]) {
  return frames.reduce((n, f) => n + (counter.update(f).repCompleted ? 1 : 0), 0);
}

describe("push-up counter", () => {
  it("counts a full rep on lockout", () => {
    const counter = createPushupCounter();
    const angles = [170, 150, 120, 90, 85, 100, 130, 160, 170];
    const frames = angles.map((a, i) => pushupFrame(a, i * 100));
    expect(countReps(counter, frames)).toBe(1);
  });

  it("counts consecutive reps", () => {
    const counter = createPushupCounter();
    const cycle = [170, 130, 90, 130, 170];
    const angles = [...cycle, ...cycle, ...cycle];
    const frames = angles.map((a, i) => pushupFrame(a, i * 100));
    expect(countReps(counter, frames)).toBe(3);
  });

  it("rejects half reps and gives depth feedback", () => {
    const counter = createPushupCounter();
    const angles = [170, 140, 120, 140, 170];
    let reps = 0;
    let sawFeedback = false;
    angles.forEach((a, i) => {
      const u = counter.update(pushupFrame(a, i * 100));
      if (u.repCompleted) reps++;
      if (u.feedback?.includes("lower")) sawFeedback = true;
    });
    expect(reps).toBe(0);
    expect(sawFeedback).toBe(true);
  });

  it("holds state when landmarks are not visible", () => {
    const counter = createPushupCounter();
    counter.update(pushupFrame(170, 0));
    counter.update(pushupFrame(85, 100));
    const invisible = blankFrame(200, 0.1);
    const u = counter.update(invisible);
    expect(u.repCompleted).toBe(false);
    expect(u.confidence).toBe(0);
    // Rep still completes once tracking recovers.
    expect(counter.update(pushupFrame(170, 300)).repCompleted).toBe(true);
  });
});

describe("squat counter", () => {
  it("counts deep squats only", () => {
    const counter = createSquatCounter();
    const deep = [175, 140, 105, 140, 175].map((a, i) => squatFrame(a, i * 100));
    expect(countReps(counter, deep)).toBe(1);

    counter.reset();
    const shallow = [175, 150, 135, 150, 175].map((a, i) => squatFrame(a, i * 100));
    expect(countReps(counter, shallow)).toBe(0);
  });
});

describe("jumping jack counter", () => {
  it("counts open-close cycles", () => {
    const counter = createJumpingJackCounter();
    const seq = [0, 0.5, 1, 0.5, 0, 0.5, 1, 0.5, 0];
    const frames = seq.map((o, i) => jackFrame(o, i * 80));
    expect(countReps(counter, frames)).toBe(2);
  });

  it("ignores arm-only movement", () => {
    const counter = createJumpingJackCounter();
    // Arms half up, legs closed -> never reaches the open threshold.
    const frames = [0, 0.4, 0.4, 0].map((o, i) => jackFrame(o, i * 80));
    expect(countReps(counter, frames)).toBe(0);
  });
});

describe("plank counter", () => {
  it("emits one rep per second of valid hold", () => {
    const counter = createPlankCounter();
    let reps = 0;
    // 3.2 simulated seconds of a good plank at 10 fps.
    for (let t = 0; t <= 3200; t += 100) {
      if (counter.update(plankFrame(t)).repCompleted) reps++;
    }
    expect(reps).toBe(3);
  });

  it("pauses the clock and coaches when hips sag", () => {
    const counter = createPlankCounter();
    let reps = 0;
    let sawFeedback = false;
    for (let t = 0; t <= 2000; t += 100) {
      const u = counter.update(plankFrame(t, true));
      if (u.repCompleted) reps++;
      if (u.feedback) sawFeedback = true;
    }
    expect(reps).toBe(0);
    expect(sawFeedback).toBe(true);
  });
});

describe("pose verifier", () => {
  it("requires consecutive visible frames", () => {
    const verifier = new PoseVerifier(5);
    for (let i = 0; i < 4; i++) {
      expect(verifier.update(blankFrame(i * 33)).verified).toBe(false);
    }
    // A dropout resets progress.
    expect(verifier.update(blankFrame(200, 0.1)).progress).toBe(0);
    for (let i = 0; i < 5; i++) {
      verifier.update(blankFrame(300 + i * 33));
    }
    expect(verifier.update(blankFrame(600)).verified).toBe(true);
  });
});
