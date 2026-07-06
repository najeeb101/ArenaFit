import { Injectable } from "@nestjs/common";

/**
 * Tracks which users currently have at least one live socket connection.
 * Refcounted rather than a plain Set so a user with multiple tabs/devices
 * doesn't get marked offline when only one of their connections drops.
 */
@Injectable()
export class PresenceService {
  private readonly connectionCounts = new Map<string, number>();

  markOnline(userId: string) {
    this.connectionCounts.set(userId, (this.connectionCounts.get(userId) ?? 0) + 1);
  }

  markOffline(userId: string) {
    const count = this.connectionCounts.get(userId) ?? 0;
    if (count <= 1) {
      this.connectionCounts.delete(userId);
    } else {
      this.connectionCounts.set(userId, count - 1);
    }
  }

  isOnline(userId: string): boolean {
    return this.connectionCounts.has(userId);
  }
}
