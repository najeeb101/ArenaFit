import { Injectable, Logger } from "@nestjs/common";
import {
  EXERCISES,
  ExerciseId,
  levelFromXp,
  MatchOutcome,
  ratingDelta,
  rewardsForMatch,
  TierId,
  tierForRating,
} from "@arenafit/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ACHIEVEMENTS } from "./achievements";

export interface MatchResultInput {
  userId: string;
  matchId: string;
  exercise: ExerciseId;
  outcome: MatchOutcome;
  reps: number;
  opponentRating: number;
  avgConfidence: number | null;
}

export interface MatchResultSummary {
  xpEarned: number;
  coinsEarned: number;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  tier: TierId;
  level: number;
  leveledUp: boolean;
  calories: number;
  unlockedAchievements: { id: string; name: string; description: string; icon: string }[];
}

/** Local calendar day bucket used for daily streak comparisons. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

@Injectable()
export class ProgressionService {
  private readonly logger = new Logger(ProgressionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async applyMatchResult(input: MatchResultInput): Promise<MatchResultSummary> {
    const { userId, matchId, exercise, outcome, reps, opponentRating } = input;

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUniqueOrThrow({ where: { userId } });
      const gamesPlayed = profile.wins + profile.losses + profile.draws;

      const delta = ratingDelta(profile.rating, opponentRating, outcome, gamesPlayed);
      const ratingAfter = profile.rating + delta;
      const tier = tierForRating(ratingAfter);

      const rewards = rewardsForMatch(outcome, reps);
      const levelBefore = profile.level;

      // Daily streak: same day keeps it, consecutive day extends it,
      // anything longer resets to 1.
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86_400_000);
      let currentStreak = 1;
      if (profile.lastActivityAt) {
        const last = dayKey(profile.lastActivityAt);
        if (last === dayKey(now)) currentStreak = Math.max(profile.currentStreak, 1);
        else if (last === dayKey(yesterday)) currentStreak = profile.currentStreak + 1;
      }

      const winStreak = outcome === "WIN" ? profile.winStreak + 1 : 0;
      const wins = profile.wins + (outcome === "WIN" ? 1 : 0);
      const losses = profile.losses + (outcome === "LOSS" ? 1 : 0);
      const draws = profile.draws + (outcome === "DRAW" ? 1 : 0);
      const totalReps = profile.totalReps + reps;

      // Evaluate achievements against the post-match state, then fold their
      // XP/coin rewards into the same update.
      const alreadyUnlocked = new Set(
        (
          await tx.userAchievement.findMany({
            where: { userId },
            select: { achievementId: true },
          })
        ).map((a) => a.achievementId),
      );

      let xpTotal = profile.xp + rewards.xp;
      let coinsTotal = profile.coins + rewards.coins;
      const ctxLevel = levelFromXp(xpTotal);
      const newlyUnlocked = ACHIEVEMENTS.filter(
        (a) =>
          !alreadyUnlocked.has(a.id) &&
          a.unlocked({
            outcome,
            repsInMatch: reps,
            totalReps,
            wins,
            totalMatches: wins + losses + draws,
            winStreak,
            currentStreak,
            level: ctxLevel,
            tier: tier.id,
          }),
      );
      for (const achievement of newlyUnlocked) {
        xpTotal += achievement.xpReward;
        coinsTotal += achievement.coinReward;
      }
      const level = levelFromXp(xpTotal);

      await tx.profile.update({
        where: { userId },
        data: {
          rating: ratingAfter,
          tier: tier.id,
          xp: xpTotal,
          coins: coinsTotal,
          level,
          wins,
          losses,
          draws,
          winStreak,
          currentStreak,
          longestStreak: Math.max(profile.longestStreak, currentStreak),
          lastActivityAt: now,
          totalReps,
        },
      });

      if (newlyUnlocked.length > 0) {
        await tx.userAchievement.createMany({
          data: newlyUnlocked.map((a) => ({ userId, achievementId: a.id })),
        });
      }

      await tx.ratingHistory.create({
        data: { userId, matchId, rating: ratingAfter, delta },
      });

      const xpEarned =
        rewards.xp + newlyUnlocked.reduce((s, a) => s + a.xpReward, 0);
      const coinsEarned =
        rewards.coins + newlyUnlocked.reduce((s, a) => s + a.coinReward, 0);

      this.logger.log(
        `Match ${matchId}: ${userId} ${outcome} (${reps} reps, ${delta >= 0 ? "+" : ""}${delta} MMR)`,
      );

      return {
        xpEarned,
        coinsEarned,
        ratingBefore: profile.rating,
        ratingAfter,
        ratingDelta: delta,
        tier: tier.id,
        level,
        leveledUp: level > levelBefore,
        calories: Math.round(reps * EXERCISES[exercise].caloriesPerRep * 10) / 10,
        unlockedAchievements: newlyUnlocked.map(({ id, name, description, icon }) => ({
          id,
          name,
          description,
          icon,
        })),
      };
    });
  }
}
