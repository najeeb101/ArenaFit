import { describe, expect, it } from "vitest";
import { expectedScore, kFactor, ratingDelta, RATING_FLOOR } from "./elo";
import { tierForRating } from "./tiers";
import { levelFromXp, levelProgress, rewardsForMatch, xpForLevel } from "./xp";

describe("elo", () => {
  it("expected score is 0.5 for equal ratings and symmetric", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
    expect(expectedScore(1400, 1200) + expectedScore(1200, 1400)).toBeCloseTo(1);
  });

  it("K decays with experience", () => {
    expect(kFactor(0)).toBe(40);
    expect(kFactor(15)).toBe(24);
    expect(kFactor(100)).toBe(16);
  });

  it("upset wins pay more than expected wins", () => {
    const upset = ratingDelta(1000, 1400, "WIN", 50);
    const expected = ratingDelta(1400, 1000, "WIN", 50);
    expect(upset).toBeGreaterThan(expected);
    expect(ratingDelta(1200, 1200, "WIN", 50)).toBeGreaterThan(0);
    expect(ratingDelta(1200, 1200, "LOSS", 50)).toBeLessThan(0);
    expect(ratingDelta(1200, 1200, "DRAW", 50)).toBe(0);
  });

  it("never drops a rating below the floor", () => {
    expect(RATING_FLOOR + ratingDelta(RATING_FLOOR, 2000, "LOSS", 50)).toBeGreaterThanOrEqual(
      RATING_FLOOR,
    );
  });
});

describe("tiers", () => {
  it("maps ratings to the right tier boundaries", () => {
    expect(tierForRating(0).id).toBe("BRONZE");
    expect(tierForRating(1099).id).toBe("BRONZE");
    expect(tierForRating(1100).id).toBe("SILVER");
    expect(tierForRating(1899).id).toBe("MASTER");
    expect(tierForRating(2500).id).toBe("CHAMPION");
  });
});

describe("xp", () => {
  it("level curve is monotonic and starts at zero", () => {
    expect(xpForLevel(1)).toBe(0);
    for (let l = 2; l <= 20; l++) {
      expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
    }
  });

  it("levelFromXp inverts xpForLevel", () => {
    for (const level of [1, 2, 5, 10, 30]) {
      expect(levelFromXp(xpForLevel(level))).toBe(level);
      expect(levelFromXp(xpForLevel(level + 1) - 1)).toBe(level);
    }
  });

  it("levelProgress reports within-level progress", () => {
    const { level, current, needed } = levelProgress(xpForLevel(3) + 10);
    expect(level).toBe(3);
    expect(current).toBe(10);
    expect(needed).toBeGreaterThan(10);
  });

  it("winning beats losing for the same reps", () => {
    expect(rewardsForMatch("WIN", 20).xp).toBeGreaterThan(rewardsForMatch("LOSS", 20).xp);
    expect(rewardsForMatch("LOSS", 20).xp).toBeGreaterThan(0);
  });
});
