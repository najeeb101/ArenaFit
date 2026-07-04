import { Injectable } from "@nestjs/common";
import { LeaderboardEntryDto, TierId } from "@arenafit/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SQL-computed boards for M1. Redis sorted sets replace this when the API
   * scales beyond a single node (see docs/architecture.md).
   */
  async global(limit = 50): Promise<LeaderboardEntryDto[]> {
    const profiles = await this.prisma.profile.findMany({
      orderBy: { rating: "desc" },
      take: limit,
      include: { user: { select: { username: true } } },
    });
    return profiles.map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      username: p.user.username,
      displayName: p.displayName,
      country: p.country,
      level: p.level,
      rating: p.rating,
      tier: p.tier as TierId,
      wins: p.wins,
      losses: p.losses,
    }));
  }

  async weekly(limit = 50): Promise<LeaderboardEntryDto[]> {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const gains = await this.prisma.ratingHistory.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since } },
      _sum: { delta: true },
      orderBy: { _sum: { delta: "desc" } },
      take: limit,
    });
    if (gains.length === 0) return [];

    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: gains.map((g) => g.userId) } },
      include: { user: { select: { username: true } } },
    });
    const byId = new Map(profiles.map((p) => [p.userId, p]));

    return gains
      .filter((g) => byId.has(g.userId))
      .map((g, i) => {
        const p = byId.get(g.userId)!;
        return {
          rank: i + 1,
          userId: p.userId,
          username: p.user.username,
          displayName: p.displayName,
          country: p.country,
          level: p.level,
          rating: p.rating,
          tier: p.tier as TierId,
          wins: p.wins,
          losses: p.losses,
          ratingGain: g._sum.delta ?? 0,
        };
      });
  }
}
