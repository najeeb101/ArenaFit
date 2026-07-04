import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AchievementDto,
  ExerciseId,
  levelProgress,
  MatchHistoryItemDto,
  MatchModeId,
  ProfileDto,
  RatingPointDto,
  TierId,
} from "@arenafit/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<ProfileDto> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { user: { select: { username: true, createdAt: true } } },
    });
    if (!profile) throw new NotFoundException("Profile not found");

    // Favorite exercise = most-played, derived rather than stored.
    const counts = await this.prisma.match.groupBy({
      by: ["exercise"],
      where: { participants: { some: { userId } }, status: "COMPLETED" },
      _count: { exercise: true },
      orderBy: { _count: { exercise: "desc" } },
      take: 1,
    });
    const favoriteExercise = (counts[0]?.exercise as ExerciseId | undefined) ?? null;

    const progress = levelProgress(profile.xp);
    return {
      userId: profile.userId,
      username: profile.user.username,
      displayName: profile.displayName,
      country: profile.country,
      level: profile.level,
      xp: profile.xp,
      xpIntoLevel: progress.current,
      xpForNextLevel: progress.needed,
      coins: profile.coins,
      rating: profile.rating,
      tier: profile.tier as TierId,
      wins: profile.wins,
      losses: profile.losses,
      draws: profile.draws,
      winStreak: profile.winStreak,
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      totalReps: profile.totalReps,
      favoriteExercise,
      createdAt: profile.user.createdAt.toISOString(),
    };
  }

  async updateProfile(
    userId: string,
    data: { displayName?: string; country?: string },
  ): Promise<ProfileDto> {
    await this.prisma.profile.update({ where: { userId }, data });
    return this.getProfile(userId);
  }

  async getMatchHistory(userId: string, limit = 20): Promise<MatchHistoryItemDto[]> {
    const participations = await this.prisma.matchParticipant.findMany({
      where: { userId, match: { status: { in: ["COMPLETED", "ABANDONED"] } } },
      include: { match: { include: { participants: true } } },
      orderBy: { match: { createdAt: "desc" } },
      take: limit,
    });

    return participations.map((p) => {
      const opponent = p.match.participants.find((x) => x.id !== p.id);
      return {
        id: p.match.id,
        exercise: p.match.exercise as ExerciseId,
        mode: p.match.mode as MatchModeId,
        endedAt: p.match.endedAt?.toISOString() ?? null,
        yourReps: p.reps,
        opponentReps: opponent?.reps ?? 0,
        opponentName: opponent?.botName ?? "Unknown",
        outcome: p.result as MatchHistoryItemDto["outcome"],
        ratingDelta: p.ratingDelta,
        xpEarned: p.xpEarned,
      };
    });
  }

  async getRatingHistory(userId: string, limit = 50): Promise<RatingPointDto[]> {
    const rows = await this.prisma.ratingHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map((r) => ({ rating: r.rating, createdAt: r.createdAt.toISOString() }));
  }

  async getAchievements(userId: string): Promise<AchievementDto[]> {
    const [all, unlocked] = await Promise.all([
      this.prisma.achievement.findMany({ orderBy: { sortOrder: "asc" } }),
      this.prisma.userAchievement.findMany({ where: { userId } }),
    ]);
    const unlockedById = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
    return all.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      xpReward: a.xpReward,
      coinReward: a.coinReward,
      unlockedAt: unlockedById.get(a.id)?.toISOString() ?? null,
    }));
  }
}
