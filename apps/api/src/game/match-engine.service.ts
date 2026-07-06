import { Injectable, Logger } from "@nestjs/common";
import {
  EXERCISES,
  ExerciseDef,
  isValidPairing,
  MATCH_MODES,
  MatchEndPayload,
  MatchModeDef,
  MatchOutcome,
  QueueJoinPayload,
  RepCompletedPayload,
} from "@arenafit/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ProgressionService } from "../progression/progression.service";
import { BotPersona, generateBotPersona, generateBotSchedule } from "./bot";
import { SUSTAINED_WINDOW_SIZE, validateRep } from "./rep-validator";

/**
 * Minimal transport interface the engine needs — satisfied by a Socket.IO
 * socket. Keeps the engine testable and transport-agnostic.
 */
export interface PlayerConnection {
  id: string;
  emit(event: string, payload: unknown): void;
}

interface ActiveMatch {
  id: string;
  userId: string;
  connection: PlayerConnection;
  exercise: ExerciseDef;
  mode: MatchModeDef;
  status: "waiting_ready" | "countdown" | "active" | "ended";
  playerReps: number;
  botReps: number;
  startedAt: number;
  /** Server-clock timestamps of the last few accepted reps, oldest first. */
  repTimestamps: number[];
  confidenceSum: number;
  bot: BotPersona;
  botSchedule: number[];
  botCursor: number;
  playerParticipantId: string;
  botParticipantId: string;
  ratingBefore: number;
  timers: NodeJS.Timeout[];
  /** Set while the player's socket is disconnected but within the reconnect grace window. */
  disconnectedAt: number | null;
  graceTimer: NodeJS.Timeout | null;
}

const QUEUE_DELAY_MS = () => 2000 + Math.random() * 6000;
/** How long a disconnected player has to reconnect before the match is scored as a loss. */
const RECONNECT_GRACE_MS = 15_000;
/** How long a player has to hit "ready" after being matched before the match is abandoned. */
const READY_TIMEOUT_MS = 45_000;

@Injectable()
export class MatchEngineService {
  private readonly logger = new Logger(MatchEngineService.name);
  /** matchId -> live match state. In-memory by design for M1 (single node). */
  private readonly matches = new Map<string, ActiveMatch>();
  /** connectionId -> pending queue timer. */
  private readonly queueTimers = new Map<string, NodeJS.Timeout>();
  /** connectionId -> matchId, for disconnect handling. */
  private readonly byConnection = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly progression: ProgressionService,
  ) {}

  async joinQueue(connection: PlayerConnection, userId: string, payload: QueueJoinPayload) {
    const exercise = EXERCISES[payload.exercise];
    const mode = MATCH_MODES[payload.mode];
    if (!exercise || !mode || !isValidPairing(exercise.id, mode.id)) {
      connection.emit("error:game", { message: "Invalid exercise/mode selection" });
      return;
    }
    this.leaveQueue(connection.id);

    connection.emit("queue:status", { position: 1, elapsedSec: 0 });
    const timer = setTimeout(() => {
      this.queueTimers.delete(connection.id);
      this.createMatch(connection, userId, exercise, mode).catch((err) => {
        this.logger.error(`Failed to create match: ${err}`);
        connection.emit("error:game", { message: "Matchmaking failed, please retry" });
      });
    }, QUEUE_DELAY_MS());
    this.queueTimers.set(connection.id, timer);
  }

  leaveQueue(connectionId: string) {
    const timer = this.queueTimers.get(connectionId);
    if (timer) {
      clearTimeout(timer);
      this.queueTimers.delete(connectionId);
    }
  }

  private async createMatch(
    connection: PlayerConnection,
    userId: string,
    exercise: ExerciseDef,
    mode: MatchModeDef,
  ) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    const bot = generateBotPersona(profile.rating);

    const match = await this.prisma.match.create({
      data: {
        exercise: exercise.id,
        mode: mode.id,
        durationSec: mode.durationSec,
        targetReps: mode.targetReps,
        participants: {
          create: [
            { userId, ratingBefore: profile.rating },
            { botName: bot.displayName, botRating: bot.rating },
          ],
        },
      },
      include: { participants: true },
    });

    const playerParticipant = match.participants.find((p) => p.userId === userId)!;
    const botParticipant = match.participants.find((p) => p.userId === null)!;

    const active: ActiveMatch = {
      id: match.id,
      userId,
      connection,
      exercise,
      mode,
      status: "waiting_ready",
      playerReps: 0,
      botReps: 0,
      startedAt: 0,
      repTimestamps: [],
      confidenceSum: 0,
      bot,
      botSchedule: generateBotSchedule(exercise, mode, bot.rating),
      botCursor: 0,
      playerParticipantId: playerParticipant.id,
      botParticipantId: botParticipant.id,
      ratingBefore: profile.rating,
      timers: [],
      disconnectedAt: null,
      graceTimer: null,
    };
    this.matches.set(match.id, active);
    this.byConnection.set(connection.id, match.id);

    connection.emit("match:found", {
      matchId: match.id,
      exercise: exercise.id,
      mode: mode.id,
      durationSec: mode.durationSec,
      targetReps: mode.targetReps,
      opponent: bot,
    });

    // A player stuck on the verify/ready screen (e.g. camera permission
    // never resolved, tab abandoned) would otherwise hold the match open
    // in memory forever — nothing else bounds "waiting_ready".
    active.timers.push(
      setTimeout(() => {
        if (active.status !== "waiting_ready") return;
        void this.end(active, "YOU_LEFT");
      }, READY_TIMEOUT_MS),
    );
  }

  ready(connectionId: string, matchId: string) {
    const match = this.matches.get(matchId);
    if (!match || match.connection.id !== connectionId || match.status !== "waiting_ready") return;

    match.status = "countdown";
    for (const value of [3, 2, 1]) {
      match.timers.push(
        setTimeout(() => {
          match.connection.emit("match:countdown", { matchId, value });
        }, (3 - value) * 1000),
      );
    }
    match.timers.push(setTimeout(() => this.start(match), 3000));
  }

  private start(match: ActiveMatch) {
    if (match.status !== "countdown") return;
    match.status = "active";
    match.startedAt = Date.now();

    void this.prisma.match
      .update({
        where: { id: match.id },
        data: { status: "ACTIVE", startedAt: new Date() },
      })
      .catch((err) => this.logger.error(`Failed to mark match active: ${err}`));

    match.connection.emit("match:start", {
      matchId: match.id,
      startedAt: match.startedAt,
      durationSec: match.mode.durationSec,
      targetReps: match.mode.targetReps,
    });

    // Replay the bot's rep schedule.
    const botTick = setInterval(() => {
      if (match.status !== "active") return;
      const elapsed = Date.now() - match.startedAt;
      let scored = false;
      while (
        match.botCursor < match.botSchedule.length &&
        match.botSchedule[match.botCursor] <= elapsed
      ) {
        match.botCursor++;
        match.botReps++;
        scored = true;
      }
      if (scored) {
        this.emitScore(match);
        if (match.mode.targetReps && match.botReps >= match.mode.targetReps) {
          void this.end(match, "TARGET_REACHED");
        }
      }
    }, 200);
    match.timers.push(botTick as unknown as NodeJS.Timeout);

    match.timers.push(
      setTimeout(() => void this.end(match, "TIME_UP"), match.mode.durationSec * 1000),
    );
  }

  repCompleted(connectionId: string, payload: RepCompletedPayload) {
    const match = this.matches.get(payload.matchId);
    if (!match || match.connection.id !== connectionId) return;
    if (match.status !== "active") {
      match?.connection.emit("rep:rejected", {
        matchId: payload.matchId,
        reason: "MATCH_NOT_ACTIVE",
      });
      return;
    }

    const now = Date.now();
    const verdict = validateRep(match.exercise, match.repTimestamps, now, payload.confidence);
    if (!verdict.accepted) {
      match.connection.emit("rep:rejected", { matchId: match.id, reason: verdict.reason });
      return;
    }

    match.repTimestamps.push(now);
    if (match.repTimestamps.length > SUSTAINED_WINDOW_SIZE) match.repTimestamps.shift();
    match.playerReps++;
    match.confidenceSum += payload.confidence;
    this.emitScore(match);

    if (match.mode.targetReps && match.playerReps >= match.mode.targetReps) {
      void this.end(match, "TARGET_REACHED");
    }
  }

  forfeit(connectionId: string, matchId: string) {
    const match = this.matches.get(matchId);
    if (!match || match.connection.id !== connectionId || match.status === "ended") return;
    void this.end(match, "YOU_LEFT");
  }

  handleDisconnect(connectionId: string) {
    this.leaveQueue(connectionId);
    const matchId = this.byConnection.get(connectionId);
    this.byConnection.delete(connectionId);
    if (!matchId) return;
    const match = this.matches.get(matchId);
    if (!match || match.status === "ended") return;

    // Network blips (wifi handoff, phone lock, tab backgrounding) shouldn't
    // hand out an instant loss — give the player a window to reconnect
    // before finalizing the match.
    match.disconnectedAt = Date.now();
    match.graceTimer = setTimeout(() => {
      if (match.status === "ended") return;
      void this.end(match, "YOU_LEFT", { emit: false });
    }, RECONNECT_GRACE_MS);
    match.timers.push(match.graceTimer);
  }

  /**
   * Called when a newly-authenticated socket connects. If this user has a
   * match awaiting reconnect within its grace window, rebind it to the new
   * connection and resync the client. Returns whether a match was resumed.
   */
  reconnect(connection: PlayerConnection, userId: string): boolean {
    for (const match of this.matches.values()) {
      if (match.userId !== userId || match.status === "ended" || match.disconnectedAt === null) {
        continue;
      }

      if (match.graceTimer) clearTimeout(match.graceTimer);
      match.graceTimer = null;
      match.disconnectedAt = null;
      match.connection = connection;
      this.byConnection.set(connection.id, match.id);

      if (match.status === "active") {
        connection.emit("match:start", {
          matchId: match.id,
          startedAt: match.startedAt,
          durationSec: match.mode.durationSec,
          targetReps: match.mode.targetReps,
        });
        this.emitScore(match);
      } else if (match.status === "waiting_ready") {
        connection.emit("match:found", {
          matchId: match.id,
          exercise: match.exercise.id,
          mode: match.mode.id,
          durationSec: match.mode.durationSec,
          targetReps: match.mode.targetReps,
          opponent: match.bot,
        });
      }
      return true;
    }
    return false;
  }

  private emitScore(match: ActiveMatch) {
    match.connection.emit("score:update", {
      matchId: match.id,
      you: match.playerReps,
      opponent: match.botReps,
    });
  }

  private async end(
    match: ActiveMatch,
    reason: MatchEndPayload["reason"],
    options: { emit?: boolean } = {},
  ) {
    if (match.status === "ended") return;
    match.status = "ended";
    // Node's clearTimeout clears both timeouts and intervals.
    match.timers.forEach((t) => clearTimeout(t));
    this.matches.delete(match.id);
    this.byConnection.delete(match.connection.id);

    let outcome: MatchOutcome;
    if (reason === "YOU_LEFT") outcome = "LOSS";
    else if (match.playerReps > match.botReps) outcome = "WIN";
    else if (match.playerReps < match.botReps) outcome = "LOSS";
    else outcome = "DRAW";

    const avgConfidence =
      match.playerReps > 0 ? match.confidenceSum / match.playerReps : null;

    try {
      const summary = await this.progression.applyMatchResult({
        userId: match.userId,
        matchId: match.id,
        exercise: match.exercise.id,
        outcome,
        reps: match.playerReps,
        opponentRating: match.bot.rating,
        avgConfidence,
      });

      const botOutcome: MatchOutcome =
        outcome === "WIN" ? "LOSS" : outcome === "LOSS" ? "WIN" : "DRAW";
      await this.prisma.$transaction([
        this.prisma.match.update({
          where: { id: match.id },
          data: {
            status: reason === "YOU_LEFT" ? "ABANDONED" : "COMPLETED",
            endedAt: new Date(),
            startedAt: match.startedAt ? new Date(match.startedAt) : null,
          },
        }),
        this.prisma.matchParticipant.update({
          where: { id: match.playerParticipantId },
          data: {
            reps: match.playerReps,
            result: outcome,
            ratingBefore: summary.ratingBefore,
            ratingDelta: summary.ratingDelta,
            xpEarned: summary.xpEarned,
            coinsEarned: summary.coinsEarned,
            avgConfidence,
          },
        }),
        this.prisma.matchParticipant.update({
          where: { id: match.botParticipantId },
          data: { reps: match.botReps, result: botOutcome },
        }),
      ]);

      if (options.emit !== false) {
        match.connection.emit("match:end", {
          matchId: match.id,
          reason,
          opponentReps: match.botReps,
          you: {
            reps: match.playerReps,
            outcome,
            ...summary,
          },
        } satisfies MatchEndPayload);
      }
    } catch (err) {
      this.logger.error(`Failed to finalize match ${match.id}: ${err}`);
      if (options.emit !== false) {
        match.connection.emit("error:game", { message: "Failed to save match result" });
      }
    }
  }
}
