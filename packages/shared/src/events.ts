import type { ExerciseId, MatchModeId } from "./exercises";
import type { TierId } from "./tiers";

/**
 * Typed Socket.IO contract shared by the NestJS gateway and the web client.
 * The battle screen only ever sees these events, so a human opponent (M2)
 * can replace the simulated one without client changes.
 */

export interface OpponentSummary {
  /** null for simulated opponents. */
  userId: string | null;
  displayName: string;
  rating: number;
  tier: TierId;
  level: number;
  country: string;
}

export interface MatchFoundPayload {
  matchId: string;
  exercise: ExerciseId;
  mode: MatchModeId;
  durationSec: number;
  targetReps: number | null;
  opponent: OpponentSummary;
}

export interface ScoreUpdatePayload {
  matchId: string;
  you: number;
  opponent: number;
}

export interface RepRejectedPayload {
  matchId: string;
  reason: "TOO_FAST" | "LOW_CONFIDENCE" | "MATCH_NOT_ACTIVE";
}

export interface MatchEndPlayerResult {
  reps: number;
  outcome: "WIN" | "LOSS" | "DRAW";
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

export interface MatchEndPayload {
  matchId: string;
  reason: "TIME_UP" | "TARGET_REACHED" | "OPPONENT_LEFT" | "YOU_LEFT";
  you: MatchEndPlayerResult;
  opponentReps: number;
}

export interface QueueJoinPayload {
  exercise: ExerciseId;
  mode: MatchModeId;
}

export interface RepCompletedPayload {
  matchId: string;
  /** Client wall-clock ms when the rep finished; server re-validates timing. */
  clientTs: number;
  /** Mean landmark visibility for the rep, 0..1. */
  confidence: number;
}

export interface CountdownPayload {
  matchId: string;
  /** 3, 2, 1 — then a `match:start`. */
  value: number;
}

export interface MatchStartPayload {
  matchId: string;
  /** Server epoch ms when scoring began. */
  startedAt: number;
  durationSec: number;
  targetReps: number | null;
}

export interface ServerToClientEvents {
  "queue:status": (p: { position: number; elapsedSec: number }) => void;
  "match:found": (p: MatchFoundPayload) => void;
  "match:countdown": (p: CountdownPayload) => void;
  "match:start": (p: MatchStartPayload) => void;
  "score:update": (p: ScoreUpdatePayload) => void;
  "rep:rejected": (p: RepRejectedPayload) => void;
  "match:end": (p: MatchEndPayload) => void;
  "error:game": (p: { message: string }) => void;
}

export interface ClientToServerEvents {
  "queue:join": (p: QueueJoinPayload) => void;
  "queue:leave": () => void;
  /** Sent after camera + pose verification passes. */
  "match:ready": (p: { matchId: string }) => void;
  "rep:completed": (p: RepCompletedPayload) => void;
  "match:forfeit": (p: { matchId: string }) => void;
}
