import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FriendDto, FriendRequestDto, TierId } from "@arenafit/shared";
import { PresenceService } from "../presence/presence.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async sendFriendRequest(userId: string, username: string): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new NotFoundException("No user with that username");
    if (target.id === userId) throw new BadRequestException("You can't friend yourself");

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: userId },
        ],
      },
    });
    if (existing) {
      throw new ConflictException(
        existing.status === "ACCEPTED" ? "Already friends" : "Friend request already pending",
      );
    }

    await this.prisma.friendship.create({
      data: { requesterId: userId, addresseeId: target.id },
    });
  }

  async listIncomingRequests(userId: string): Promise<FriendRequestDto[]> {
    const requests = await this.prisma.friendship.findMany({
      where: { addresseeId: userId, status: "PENDING" },
      include: { requester: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
    });
    return requests.map((r) => ({
      id: r.id,
      fromUserId: r.requesterId,
      username: r.requester.username,
      displayName: r.requester.profile?.displayName ?? r.requester.username,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async acceptRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!request || request.addresseeId !== userId || request.status !== "PENDING") {
      throw new NotFoundException("Friend request not found");
    }
    await this.prisma.friendship.update({
      where: { id: requestId },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
  }

  async declineRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!request || request.addresseeId !== userId || request.status !== "PENDING") {
      throw new NotFoundException("Friend request not found");
    }
    await this.prisma.friendship.delete({ where: { id: requestId } });
  }

  async listFriends(userId: string): Promise<FriendDto[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { include: { profile: true } },
        addressee: { include: { profile: true } },
      },
    });

    return friendships
      .map((f) => {
        const other = f.requesterId === userId ? f.addressee : f.requester;
        if (!other.profile) return null;
        return {
          friendshipId: f.id,
          userId: other.id,
          username: other.username,
          displayName: other.profile.displayName,
          country: other.profile.country,
          level: other.profile.level,
          rating: other.profile.rating,
          tier: other.profile.tier as TierId,
          online: this.presence.isOnline(other.id),
        };
      })
      .filter((f): f is FriendDto => f !== null);
  }

  async removeFriend(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (
      !friendship ||
      friendship.status !== "ACCEPTED" ||
      (friendship.requesterId !== userId && friendship.addresseeId !== userId)
    ) {
      throw new NotFoundException("Friendship not found");
    }
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }
}
