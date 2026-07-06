import { describe, expect, it } from "vitest";
import { EXERCISES, MATCH_MODES } from "@arenafit/shared";
import { generateBotPersona, generateBotSchedule, skillFactor } from "./bot";
import { validateRep } from "./rep-validator";

/** Deterministic RNG for reproducible schedules. */
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("bot persona", () => {
  it("stays within ±120 rating of the player", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 50; i++) {
      const bot = generateBotPersona(1200, rng);
      expect(Math.abs(bot.rating - 1200)).toBeLessThanOrEqual(120);
      expect(bot.displayName.length).toBeGreaterThan(0);
      expect(bot.userId).toBeNull();
    }
  });
});

describe("bot schedule", () => {
  it("produces a plausible push-up count for 60s", () => {
    const rng = seededRng(7);
    const schedule = generateBotSchedule(EXERCISES.PUSHUP, MATCH_MODES.TIMED_60, 1000, rng);
    // ~0.55 rps * skill * fatigue -> roughly 15-35 reps in a minute.
    expect(schedule.length).toBeGreaterThan(10);
    expect(schedule.length).toBeLessThan(40);
    expect(schedule.every((t) => t > 0 && t < 60_000)).toBe(true);
    // Strictly increasing timestamps.
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]).toBeGreaterThan(schedule[i - 1]);
    }
  });

  it("respects a first-to-N target", () => {
    const rng = seededRng(3);
    const schedule = generateBotSchedule(EXERCISES.SQUAT, MATCH_MODES.FIRST_TO_25, 1400, rng);
    expect(schedule.length).toBeLessThanOrEqual(25);
  });

  it("higher rating means faster cadence", () => {
    expect(skillFactor(1800)).toBeGreaterThan(skillFactor(900));
    const slow = generateBotSchedule(EXERCISES.JUMPING_JACK, MATCH_MODES.TIMED_60, 700, seededRng(9));
    const fast = generateBotSchedule(EXERCISES.JUMPING_JACK, MATCH_MODES.TIMED_60, 1900, seededRng(9));
    expect(fast.length).toBeGreaterThan(slow.length);
  });
});

describe("rep validation", () => {
  it("rejects superhuman cadence", () => {
    const verdict = validateRep(EXERCISES.PUSHUP, [1000], 1200, 0.9);
    expect(verdict).toEqual({ accepted: false, reason: "TOO_FAST" });
  });

  it("accepts a normal cadence", () => {
    expect(validateRep(EXERCISES.PUSHUP, [1000], 2200, 0.9).accepted).toBe(true);
    expect(validateRep(EXERCISES.PUSHUP, [], 500, 0.9).accepted).toBe(true);
  });

  it("rejects low-confidence tracking", () => {
    const verdict = validateRep(EXERCISES.SQUAT, [], 5000, 0.2);
    expect(verdict).toEqual({ accepted: false, reason: "LOW_CONFIDENCE" });
  });

  it("accepts a human-plausible sustained cadence with natural jitter", () => {
    // PUSHUP minRepIntervalMs is 900ms elsewhere in fixtures; jitter above and
    // below the floor should average out well clear of the sustained-rate cap.
    const interval = EXERCISES.PUSHUP.minRepIntervalMs;
    let t = 0;
    const timestamps: number[] = [];
    for (let i = 0; i < 5; i++) {
      t += interval * (i % 2 === 0 ? 1.3 : 1.1);
      timestamps.push(t);
    }
    const verdict = validateRep(EXERCISES.PUSHUP, timestamps, t + interval * 1.2, 0.9);
    expect(verdict.accepted).toBe(true);
  });

  it("rejects a metronomic sequence sitting right at the single-rep floor", () => {
    // Every individual gap clears the 0.8x floor, but the sustained average
    // is suspiciously exact — the signature of a scripted/replayed sequence.
    const interval = EXERCISES.PUSHUP.minRepIntervalMs * 0.81;
    let t = 0;
    const timestamps: number[] = [];
    for (let i = 0; i < 5; i++) {
      t += interval;
      timestamps.push(t);
    }
    const verdict = validateRep(EXERCISES.PUSHUP, timestamps, t + interval, 0.9);
    expect(verdict).toEqual({ accepted: false, reason: "TOO_FAST" });
  });
});
