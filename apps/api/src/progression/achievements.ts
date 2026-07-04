/**
 * Achievement catalog + pure unlock predicates, evaluated after every match.
 * The catalog is mirrored into the Achievement table by the seed script.
 */

export interface AchievementContext {
  outcome: "WIN" | "LOSS" | "DRAW";
  repsInMatch: number;
  totalReps: number;
  wins: number;
  totalMatches: number;
  winStreak: number;
  currentStreak: number;
  level: number;
  tier: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  coinReward: number;
  unlocked(ctx: AchievementContext): boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "FIRST_MATCH",
    name: "Into the Arena",
    description: "Complete your first battle.",
    icon: "⚔️",
    xpReward: 50,
    coinReward: 25,
    unlocked: (ctx) => ctx.totalMatches >= 1,
  },
  {
    id: "FIRST_WIN",
    name: "First Blood",
    description: "Win your first battle.",
    icon: "\u{1F3C6}",
    xpReward: 100,
    coinReward: 50,
    unlocked: (ctx) => ctx.wins >= 1,
  },
  {
    id: "WIN_5",
    name: "Warmed Up",
    description: "Win 5 battles.",
    icon: "\u{1F525}",
    xpReward: 150,
    coinReward: 75,
    unlocked: (ctx) => ctx.wins >= 5,
  },
  {
    id: "WIN_25",
    name: "Arena Regular",
    description: "Win 25 battles.",
    icon: "\u{1F396}️",
    xpReward: 400,
    coinReward: 200,
    unlocked: (ctx) => ctx.wins >= 25,
  },
  {
    id: "WIN_STREAK_3",
    name: "On a Tear",
    description: "Win 3 battles in a row.",
    icon: "⚡",
    xpReward: 200,
    coinReward: 100,
    unlocked: (ctx) => ctx.winStreak >= 3,
  },
  {
    id: "REPS_100",
    name: "Century Club",
    description: "Reach 100 total reps.",
    icon: "\u{1F4AF}",
    xpReward: 150,
    coinReward: 75,
    unlocked: (ctx) => ctx.totalReps >= 100,
  },
  {
    id: "REPS_1000",
    name: "Machine",
    description: "Reach 1,000 total reps.",
    icon: "\u{1F916}",
    xpReward: 500,
    coinReward: 250,
    unlocked: (ctx) => ctx.totalReps >= 1000,
  },
  {
    id: "BIG_SET",
    name: "Big Set",
    description: "Score 30+ reps in a single battle.",
    icon: "\u{1F4AA}",
    xpReward: 200,
    coinReward: 100,
    unlocked: (ctx) => ctx.repsInMatch >= 30,
  },
  {
    id: "DAILY_3",
    name: "Habit Forming",
    description: "Battle on 3 days in a row.",
    icon: "\u{1F4C5}",
    xpReward: 200,
    coinReward: 100,
    unlocked: (ctx) => ctx.currentStreak >= 3,
  },
  {
    id: "DAILY_7",
    name: "Unbreakable",
    description: "Battle on 7 days in a row.",
    icon: "\u{1F5FF}",
    xpReward: 500,
    coinReward: 250,
    unlocked: (ctx) => ctx.currentStreak >= 7,
  },
  {
    id: "LEVEL_5",
    name: "Rising Star",
    description: "Reach level 5.",
    icon: "⭐",
    xpReward: 0,
    coinReward: 150,
    unlocked: (ctx) => ctx.level >= 5,
  },
  {
    id: "TIER_GOLD",
    name: "Golden",
    description: "Reach the Gold tier.",
    icon: "\u{1F947}",
    xpReward: 300,
    coinReward: 200,
    unlocked: (ctx) => ["GOLD", "PLATINUM", "DIAMOND", "MASTER", "CHAMPION"].includes(ctx.tier),
  },
];
