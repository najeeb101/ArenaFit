import type { ExerciseId, MatchModeId } from "./exercises";
import type { TierId } from "./tiers";

/** REST response shapes shared between the API and the web client. */

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: "USER" | "ADMIN";
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface ProfileDto {
  userId: string;
  username: string;
  displayName: string;
  country: string;
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  coins: number;
  rating: number;
  tier: TierId;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  currentStreak: number;
  longestStreak: number;
  totalReps: number;
  favoriteExercise: ExerciseId | null;
  createdAt: string;
}

export interface MatchHistoryItemDto {
  id: string;
  exercise: ExerciseId;
  mode: MatchModeId;
  endedAt: string | null;
  yourReps: number;
  opponentReps: number;
  opponentName: string;
  outcome: "WIN" | "LOSS" | "DRAW" | null;
  ratingDelta: number | null;
  xpEarned: number;
}

export interface LeaderboardEntryDto {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  country: string;
  level: number;
  rating: number;
  tier: TierId;
  wins: number;
  losses: number;
  /** Rating gained over the window (weekly board only). */
  ratingGain?: number;
}

export interface RatingPointDto {
  rating: number;
  createdAt: string;
}

export interface AchievementDto {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  coinReward: number;
  unlockedAt: string | null;
}

export interface FriendDto {
  friendshipId: string;
  userId: string;
  username: string;
  displayName: string;
  country: string;
  level: number;
  rating: number;
  tier: TierId;
  online: boolean;
}

export interface FriendRequestDto {
  id: string;
  fromUserId: string;
  username: string;
  displayName: string;
  createdAt: string;
}
