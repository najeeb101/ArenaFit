import type { MatchOutcome } from "./elo";

export const MAX_LEVEL = 100;

/** Total XP required to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 2; l <= level; l++) {
    total += Math.round(100 * Math.pow(l - 1, 1.35));
  }
  return total;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Progress within the current level, for progress bars. Returns [current, needed]. */
export function levelProgress(xp: number): { level: number; current: number; needed: number } {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const next = level >= MAX_LEVEL ? base : xpForLevel(level + 1);
  return { level, current: xp - base, needed: Math.max(next - base, 1) };
}

export interface MatchRewards {
  xp: number;
  coins: number;
}

export function rewardsForMatch(outcome: MatchOutcome, reps: number): MatchRewards {
  const base = 40 + Math.min(reps, 100) * 2;
  const winBonus = outcome === "WIN" ? 60 : outcome === "DRAW" ? 25 : 0;
  const xp = base + winBonus;
  const coins = Math.round(xp / 4);
  return { xp, coins };
}
