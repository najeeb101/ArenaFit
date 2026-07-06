import { Injectable, Logger } from "@nestjs/common";
import {
  EXERCISES,
  ExerciseDef,
  isValidPairing,
  MATCH_MODES,
  MatchEndPayload,
  MatchModeDef,
  MatchOutcome,
  OpponentSummary,
  QueueJoinPayload,
  RepCompletedPayload,
  TierId,
} from "@arenafit/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MatchResultSummary, ProgressionService } from "../progression/progression.service";
import { generateBotPersona, generateBotSchedule } from "./bot";
import { SUSTAINED_WINDOW_SIZE, validateRep } from "./rep-validator";
import { relaySignal } from "./webrtc-relay";

/**
 * Minimal transport interface the engine needs — satisfied by a Socket.IO
 * socket. Keeps the engine testable and transport-agnostic.
 */
export interface PlayerConnection {
  id: string;
  emit(event: string, payload: unknown): void;
}

/**
 * A match has a fixed set of participants — solo-vs-bot has one human plus
 * one bot; a private-room match has two humans. Outcome derivation below
 * assumes exactly two participants, which holds for every mode today.
 */
interface ParticipantBase {
  /** MatchParticipant DB row id. */
  participantId: string;
  reps: number;
  /** How this participant appears to every other participant. */
  summary: OpponentSummary;
}

interface HumanParticipant extends ParticipantBase {
  kind: "human";
  userId: string;
  connection: PlayerConnection;
  /** Has this participant sent match:ready? All humans must before countdown starts. */
  ready: boolean;
  /** Server-clock timestamps of the last few accepted reps, oldest first. */
  repTimestamps: number[];
  confidenceSum: number;
  /** Set while this player's socket is disconnected but within the reconnect grace window. */
  disconnectedAt: number | null;
  graceTimer: NodeJS.Timeout | null;
}

interface BotParticipant extends ParticipantBase {
  kind: "bot";
  schedule: number[];
  cursor: number;
}

type Participant = HumanParticipant | BotParticipant;

function isHuman(p: Participant): p is HumanParticipant {
  return p.kind === "human";
}

interface ActiveMatch {
  id: string;
  exercise: ExerciseDef;
  mode: MatchModeDef;
  status: "waiting_ready" | "countdown" | "active" | "ended";
  startedAt: number;
  participants: Participant[];
  timers: NodeJS.Timeout[];
}

interface PendingRoom {
  code: string;
  hostUserId: string;
  hostConnection: PlayerConnection;
  exercise: ExerciseDef;
  mode: MatchModeDef;
  expiresTimer: NodeJS.Timeout;
}

/** A just-finished human-vs-human match, kept briefly so both sides can request a rematch without a page reload. */
interface RecentMatch {
  participants: { userId: string; connection: PlayerConnection }[];
  exercise: ExerciseDef;
  mode: MatchModeDef;
  rematchRequestedBy: Set<string>;
  expiresTimer: NodeJS.Timeout;
}

const QUEUE_DELAY_MS = () => 2000 + Math.random() * 6000;
/** How long a disconnected player has to reconnect before the match is scored as a loss. */
const RECONNECT_GRACE_MS = 15_000;
/** How long a player has to hit "ready" after being matched before the match is abandoned. */
const READY_TIMEOUT_MS = 45_000;
/** How long an unclaimed private-room invite code stays valid. */
const ROOM_EXPIRY_MS = 5 * 60_000;
/** How long after a human-vs-human match ends that a rematch can still be requested. */
const REMATCH_WINDOW_MS = 2 * 60_000;
/** Avoids visually-ambiguous characters (0/O, 1/I) in shareable room codes. */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

@Injectable()
export class MatchEngineService {
  private readonly logger = new Logger(MatchEngineService.name);
  /** matchId -> live match state. In-memory by design for M1 (single node). */
  private readonly matches = new Map<string, ActiveMatch>();
  /** connectionId -> pending queue timer. */
  private readonly queueTimers = new Map<string, NodeJS.Timeout>();
  /** connectionId -> matchId, for disconnect handling. */
  private readonly byConnection = new Map<string, string>();
  /** room code -> pending private-match invite. */
  private readonly pendingRooms = new Map<string, PendingRoom>();
  /** matchId -> recently-ended human-vs-human match, eligible for rematch. */
  private readonly recentMatches = new Map<string, RecentMatch>();

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
      this.createBotMatch(connection, userId, exercise, mode).catch((err) => {
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

  /** Creates a shareable private-room invite code. Expires unclaimed after 5 minutes. */
  createRoom(connection: PlayerConnection, userId: string, payload: QueueJoinPayload) {
    const exercise = EXERCISES[payload.exercise];
    const mode = MATCH_MODES[payload.mode];
    if (!exercise || !mode || !isValidPairing(exercise.id, mode.id)) {
      connection.emit("error:game", { message: "Invalid exercise/mode selection" });
      return;
    }

    const code = this.generateRoomCode();
    const expiresTimer = setTimeout(() => {
      this.pendingRooms.delete(code);
      connection.emit("error:game", { message: "Room invite expired — no one joined in time" });
    }, ROOM_EXPIRY_MS);
    this.pendingRooms.set(code, { code, hostUserId: userId, hostConnection: connection, exercise, mode, expiresTimer });
    connection.emit("room:created", { code });
  }

  /** Joins a private room by its invite code, starting a real human-vs-human match. */
  joinRoom(connection: PlayerConnection, userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    const room = this.pendingRooms.get(code);
    if (!room) {
      connection.emit("error:game", { message: "Room not found or expired" });
      return;
    }
    if (room.hostUserId === userId) {
      connection.emit("error:game", { message: "You can't join your own room" });
      return;
    }
    clearTimeout(room.expiresTimer);
    this.pendingRooms.delete(code);

    this.createHumanMatch(
      { userId: room.hostUserId, connection: room.hostConnection },
      { userId, connection },
      room.exercise,
      room.mode,
    ).catch((err) => {
      this.logger.error(`Failed to create private match: ${err}`);
      const message = "Could not start the match, please retry";
      connection.emit("error:game", { message });
      room.hostConnection.emit("error:game", { message });
    });
  }

  /** Both participants of a just-ended human-vs-human match must call this to trigger a rematch. */
  requestRematch(connectionId: string, matchId: string) {
    const recent = this.recentMatches.get(matchId);
    if (!recent) return;
    const participant = recent.participants.find((p) => p.connection.id === connectionId);
    if (!participant) return;

    recent.rematchRequestedBy.add(participant.userId);
    if (recent.rematchRequestedBy.size < recent.participants.length) {
      participant.connection.emit("match:rematch-pending", { matchId });
      return;
    }

    clearTimeout(recent.expiresTimer);
    this.recentMatches.delete(matchId);

    const [a, b] = recent.participants;
    this.createHumanMatch(a, b, recent.exercise, recent.mode).catch((err) => {
      this.logger.error(`Failed to create rematch: ${err}`);
      for (const p of recent.participants) {
        p.connection.emit("error:game", { message: "Rematch failed, please retry" });
      }
    });
  }

  private generateRoomCode(): string {
    let code: string;
    do {
      code = Array.from(
        { length: 6 },
        () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)],
      ).join("");
    } while (this.pendingRooms.has(code));
    return code;
  }

  private async createBotMatch(
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

    const playerRow = match.participants.find((p) => p.userId === userId)!;
    const botRow = match.participants.find((p) => p.userId === null)!;

    const human = this.buildHumanParticipant(playerRow.id, userId, connection, profile);
    const botParticipant: BotParticipant = {
      kind: "bot",
      participantId: botRow.id,
      reps: 0,
      schedule: generateBotSchedule(exercise, mode, bot.rating),
      cursor: 0,
      summary: bot,
    };

    this.registerMatch(match.id, exercise, mode, [human, botParticipant]);
  }

  /** Shared by private-room joins and rematches — a real match between two known users. */
  private async createHumanMatch(
    a: { userId: string; connection: PlayerConnection },
    b: { userId: string; connection: PlayerConnection },
    exercise: ExerciseDef,
    mode: MatchModeDef,
  ) {
    const [profileA, profileB] = await Promise.all([
      this.prisma.profile.findUniqueOrThrow({ where: { userId: a.userId } }),
      this.prisma.profile.findUniqueOrThrow({ where: { userId: b.userId } }),
    ]);

    const match = await this.prisma.match.create({
      data: {
        exercise: exercise.id,
        mode: mode.id,
        durationSec: mode.durationSec,
        targetReps: mode.targetReps,
        participants: {
          create: [
            { userId: a.userId, ratingBefore: profileA.rating },
            { userId: b.userId, ratingBefore: profileB.rating },
          ],
        },
      },
      include: { participants: true },
    });

    const rowA = match.participants.find((p) => p.userId === a.userId)!;
    const rowB = match.participants.find((p) => p.userId === b.userId)!;

    const humanA = this.buildHumanParticipant(rowA.id, a.userId, a.connection, profileA);
    const humanB = this.buildHumanParticipant(rowB.id, b.userId, b.connection, profileB);

    this.registerMatch(match.id, exercise, mode, [humanA, humanB]);
  }

  private buildHumanParticipant(
    participantId: string,
    userId: string,
    connection: PlayerConnection,
    profile: { rating: number; displayName: string; tier: string; level: number; country: string },
  ): HumanParticipant {
    return {
      kind: "human",
      participantId,
      reps: 0,
      userId,
      connection,
      ready: false,
      repTimestamps: [],
      confidenceSum: 0,
      disconnectedAt: null,
      graceTimer: null,
      summary: {
        userId,
        displayName: profile.displayName,
        rating: profile.rating,
        tier: profile.tier as TierId,
        level: profile.level,
        country: profile.country,
      },
    };
  }

  private registerMatch(
    matchId: string,
    exercise: ExerciseDef,
    mode: MatchModeDef,
    participants: Participant[],
  ) {
    const active: ActiveMatch = {
      id: matchId,
      exercise,
      mode,
      status: "waiting_ready",
      startedAt: 0,
      participants,
      timers: [],
    };
    this.matches.set(matchId, active);

    for (const p of participants) {
      if (!isHuman(p)) continue;
      this.byConnection.set(p.connection.id, matchId);
      p.connection.emit("match:found", {
        matchId,
        exercise: exercise.id,
        mode: mode.id,
        durationSec: mode.durationSec,
        targetReps: mode.targetReps,
        opponent: this.opponentSummaryFor(active, p),
      });
    }

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
    if (!match || match.status !== "waiting_ready") return;
    const human = this.findHuman(match, connectionId);
    if (!human || human.ready) return;
    human.ready = true;

    const allReady = match.participants.filter(isHuman).every((p) => p.ready);
    if (!allReady) return;

    match.status = "countdown";
    for (const value of [3, 2, 1]) {
      match.timers.push(
        setTimeout(() => {
          this.emitToHumans(match, "match:countdown", { matchId, value });
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

    this.emitToHumans(match, "match:start", {
      matchId: match.id,
      startedAt: match.startedAt,
      durationSec: match.mode.durationSec,
      targetReps: match.mode.targetReps,
    });

    // Replay every bot participant's rep schedule.
    const botTick = setInterval(() => {
      if (match.status !== "active") return;
      const elapsed = Date.now() - match.startedAt;
      let scored = false;
      for (const p of match.participants) {
        if (p.kind !== "bot") continue;
        while (p.cursor < p.schedule.length && p.schedule[p.cursor] <= elapsed) {
          p.cursor++;
          p.reps++;
          scored = true;
        }
      }
      if (scored) {
        this.broadcastScore(match);
        if (
          match.mode.targetReps &&
          match.participants.some((p) => p.reps >= match.mode.targetReps!)
        ) {
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
    const human = match ? this.findHuman(match, connectionId) : undefined;
    if (!match || !human) return;
    if (match.status !== "active") {
      human.connection.emit("rep:rejected", {
        matchId: payload.matchId,
        reason: "MATCH_NOT_ACTIVE",
      });
      return;
    }

    const now = Date.now();
    const verdict = validateRep(match.exercise, human.repTimestamps, now, payload.confidence);
    if (!verdict.accepted) {
      human.connection.emit("rep:rejected", { matchId: match.id, reason: verdict.reason });
      return;
    }

    human.repTimestamps.push(now);
    if (human.repTimestamps.length > SUSTAINED_WINDOW_SIZE) human.repTimestamps.shift();
    human.reps++;
    human.confidenceSum += payload.confidence;
    this.broadcastScore(match);

    if (match.mode.targetReps && human.reps >= match.mode.targetReps) {
      void this.end(match, "TARGET_REACHED");
    }
  }

  forfeit(connectionId: string, matchId: string) {
    const match = this.matches.get(matchId);
    const human = match ? this.findHuman(match, connectionId) : undefined;
    if (!match || !human || match.status === "ended") return;
    void this.end(match, "YOU_LEFT", { leaver: human });
  }

  handleDisconnect(connectionId: string) {
    this.leaveQueue(connectionId);
    const matchId = this.byConnection.get(connectionId);
    this.byConnection.delete(connectionId);
    if (!matchId) return;
    const match = this.matches.get(matchId);
    if (!match || match.status === "ended") return;
    const human = this.findHuman(match, connectionId);
    if (!human) return;

    // Network blips (wifi handoff, phone lock, tab backgrounding) shouldn't
    // hand out an instant loss — give the player a window to reconnect
    // before finalizing the match.
    human.disconnectedAt = Date.now();
    human.graceTimer = setTimeout(() => {
      if (match.status === "ended") return;
      void this.end(match, "YOU_LEFT", { emit: false, leaver: human });
    }, RECONNECT_GRACE_MS);
    match.timers.push(human.graceTimer);
  }

  /**
   * Called when a newly-authenticated socket connects. If this user has a
   * match awaiting reconnect within its grace window, rebind it to the new
   * connection and resync the client. Returns whether a match was resumed.
   */
  reconnect(connection: PlayerConnection, userId: string): boolean {
    for (const match of this.matches.values()) {
      if (match.status === "ended") continue;
      const human = match.participants.find(
        (p): p is HumanParticipant =>
          isHuman(p) && p.userId === userId && p.disconnectedAt !== null,
      );
      if (!human) continue;

      if (human.graceTimer) clearTimeout(human.graceTimer);
      human.graceTimer = null;
      human.disconnectedAt = null;
      human.connection = connection;
      this.byConnection.set(connection.id, match.id);

      if (match.status === "active") {
        connection.emit("match:start", {
          matchId: match.id,
          startedAt: match.startedAt,
          durationSec: match.mode.durationSec,
          targetReps: match.mode.targetReps,
        });
        connection.emit("score:update", {
          matchId: match.id,
          you: human.reps,
          opponent: this.opponentRepsFor(match, human),
        });
      } else if (match.status === "waiting_ready") {
        connection.emit("match:found", {
          matchId: match.id,
          exercise: match.exercise.id,
          mode: match.mode.id,
          durationSec: match.mode.durationSec,
          targetReps: match.mode.targetReps,
          opponent: this.opponentSummaryFor(match, human),
        });
      }
      return true;
    }
    return false;
  }

  /**
   * Relays a WebRTC offer/answer/ICE-candidate to the other human
   * participant(s) in the match. A no-op in solo-vs-bot matches — there's
   * no other human to signal to.
   */
  relaySignal(connectionId: string, matchId: string, event: string, payload: unknown) {
    const match = this.matches.get(matchId);
    if (!match) return;
    const sender = this.findHuman(match, connectionId);
    if (!sender) return;

    const peers = match.participants.filter(isHuman).map((p) => ({
      connectionId: p.connection.id,
      emit: (e: string, pl: unknown) => p.connection.emit(e, pl),
    }));
    relaySignal(peers, connectionId, event, payload);
  }

  private findHuman(match: ActiveMatch, connectionId: string): HumanParticipant | undefined {
    return match.participants.find(
      (p): p is HumanParticipant => isHuman(p) && p.connection.id === connectionId,
    );
  }

  /** The other participants' summed reps — valid for the 2-participant matches every mode has today. */
  private opponentRepsFor(match: ActiveMatch, participant: Participant): number {
    return match.participants
      .filter((p) => p !== participant)
      .reduce((sum, p) => sum + p.reps, 0);
  }

  /** What "the opponent" looks like from this participant's perspective — assumes exactly 2 participants. */
  private opponentSummaryFor(match: ActiveMatch, participant: Participant): OpponentSummary {
    const other = match.participants.find((p) => p !== participant)!;
    return other.summary;
  }

  private emitToHumans(match: ActiveMatch, event: string, payload: unknown) {
    for (const p of match.participants) {
      if (isHuman(p)) p.connection.emit(event, payload);
    }
  }

  private broadcastScore(match: ActiveMatch) {
    for (const p of match.participants) {
      if (!isHuman(p)) continue;
      p.connection.emit("score:update", {
        matchId: match.id,
        you: p.reps,
        opponent: this.opponentRepsFor(match, p),
      });
    }
  }

  /** Keeps a human-vs-human match around briefly so both sides can request a rematch. */
  private storeRecentMatch(match: ActiveMatch) {
    const humans = match.participants.filter(isHuman);
    if (humans.length !== match.participants.length || humans.length !== 2) return;

    const expiresTimer = setTimeout(() => this.recentMatches.delete(match.id), REMATCH_WINDOW_MS);
    this.recentMatches.set(match.id, {
      participants: humans.map((p) => ({ userId: p.userId, connection: p.connection })),
      exercise: match.exercise,
      mode: match.mode,
      rematchRequestedBy: new Set(),
      expiresTimer,
    });
  }

  private async end(
    match: ActiveMatch,
    reason: MatchEndPayload["reason"],
    options: { emit?: boolean; leaver?: HumanParticipant } = {},
  ) {
    if (match.status === "ended") return;
    match.status = "ended";
    // Node's clearTimeout clears both timeouts and intervals.
    match.timers.forEach((t) => clearTimeout(t));
    this.matches.delete(match.id);
    for (const p of match.participants) {
      if (isHuman(p)) this.byConnection.delete(p.connection.id);
    }
    this.storeRecentMatch(match);

    const humans = match.participants.filter(isHuman);
    if (humans.length === 0) return;

    // A participant's own outcome; "YOU_LEFT" with no specific leaver (e.g.
    // a ready-timeout nobody can be pinned on) forces everyone to LOSS,
    // matching pre-multi-human behavior.
    function outcomeFor(p: Participant): MatchOutcome {
      if (reason === "YOU_LEFT") {
        if (!options.leaver) return "LOSS";
        return p === options.leaver ? "LOSS" : "WIN";
      }
      const opponentReps = match.participants
        .filter((x) => x !== p)
        .reduce((sum, x) => sum + x.reps, 0);
      return p.reps > opponentReps ? "WIN" : p.reps < opponentReps ? "LOSS" : "DRAW";
    }

    const matchStatus = reason === "YOU_LEFT" ? "ABANDONED" : "COMPLETED";
    const summaries = new Map<HumanParticipant, MatchResultSummary>();

    try {
      const dbUpdates = [];
      for (const p of match.participants) {
        const outcome = outcomeFor(p);
        if (isHuman(p)) {
          const avgConfidence = p.reps > 0 ? p.confidenceSum / p.reps : null;
          const summary = await this.progression.applyMatchResult({
            userId: p.userId,
            matchId: match.id,
            exercise: match.exercise.id,
            outcome,
            reps: p.reps,
            opponentRating: this.opponentSummaryFor(match, p).rating,
            avgConfidence,
          });
          summaries.set(p, summary);
          dbUpdates.push(
            this.prisma.matchParticipant.update({
              where: { id: p.participantId },
              data: {
                reps: p.reps,
                result: outcome,
                ratingBefore: summary.ratingBefore,
                ratingDelta: summary.ratingDelta,
                xpEarned: summary.xpEarned,
                coinsEarned: summary.coinsEarned,
                avgConfidence,
              },
            }),
          );
        } else {
          dbUpdates.push(
            this.prisma.matchParticipant.update({
              where: { id: p.participantId },
              data: { reps: p.reps, result: outcome },
            }),
          );
        }
      }

      await this.prisma.$transaction([
        this.prisma.match.update({
          where: { id: match.id },
          data: {
            status: matchStatus,
            endedAt: new Date(),
            startedAt: match.startedAt ? new Date(match.startedAt) : null,
          },
        }),
        ...dbUpdates,
      ]);

      for (const p of humans) {
        if (options.emit === false && p === options.leaver) continue;
        const summary = summaries.get(p)!;
        const personalReason: MatchEndPayload["reason"] =
          reason === "YOU_LEFT" && options.leaver && p !== options.leaver
            ? "OPPONENT_LEFT"
            : reason;
        p.connection.emit("match:end", {
          matchId: match.id,
          reason: personalReason,
          opponentReps: this.opponentRepsFor(match, p),
          you: {
            reps: p.reps,
            outcome: outcomeFor(p),
            ...summary,
          },
        } satisfies MatchEndPayload);
      }
    } catch (err) {
      this.logger.error(`Failed to finalize match ${match.id}: ${err}`);
      for (const p of humans) {
        if (options.emit === false && p === options.leaver) continue;
        p.connection.emit("error:game", { message: "Failed to save match result" });
      }
    }
  }
}
