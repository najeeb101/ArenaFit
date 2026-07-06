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
import { ProgressionService } from "../progression/progression.service";
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
 * A match has a fixed set of participants — today always exactly one human
 * plus one bot, but modeled generically so a real human-vs-human opponent
 * (M2) is a matter of adding a second HumanParticipant, not rewriting the
 * engine. Outcome derivation below assumes exactly two participants, which
 * holds for every mode in MATCH_MODES today.
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

function invert(outcome: MatchOutcome): MatchOutcome {
  return outcome === "WIN" ? "LOSS" : outcome === "LOSS" ? "WIN" : "DRAW";
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

    const playerRow = match.participants.find((p) => p.userId === userId)!;
    const botRow = match.participants.find((p) => p.userId === null)!;

    const human: HumanParticipant = {
      kind: "human",
      participantId: playerRow.id,
      reps: 0,
      userId,
      connection,
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

    const botParticipant: BotParticipant = {
      kind: "bot",
      participantId: botRow.id,
      reps: 0,
      schedule: generateBotSchedule(exercise, mode, bot.rating),
      cursor: 0,
      summary: bot,
    };

    const active: ActiveMatch = {
      id: match.id,
      exercise,
      mode,
      status: "waiting_ready",
      startedAt: 0,
      participants: [human, botParticipant],
      timers: [],
    };
    this.matches.set(match.id, active);
    this.byConnection.set(connection.id, match.id);

    connection.emit("match:found", {
      matchId: match.id,
      exercise: exercise.id,
      mode: mode.id,
      durationSec: mode.durationSec,
      targetReps: mode.targetReps,
      opponent: this.opponentSummaryFor(active, human),
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
    if (!match || match.status !== "waiting_ready") return;
    const human = this.findHuman(match, connectionId);
    if (!human) return;

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
    void this.end(match, "YOU_LEFT");
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
      void this.end(match, "YOU_LEFT", { emit: false });
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
   * participant(s) in the match. A no-op today — every match is solo-vs-bot,
   * so there's no other human to signal to — but wired up so real
   * human-vs-human matches (M2) light this up without gateway changes.
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
    for (const p of match.participants) {
      if (isHuman(p)) this.byConnection.delete(p.connection.id);
    }

    // Every mode today is exactly 2 participants, so there's exactly one
    // human whose outcome drives everyone else's (inverted). Revisit once
    // true multi-human matches exist.
    const human = match.participants.find(isHuman);
    if (!human) return;

    let outcome: MatchOutcome;
    if (reason === "YOU_LEFT") {
      outcome = "LOSS";
    } else {
      const opponentReps = this.opponentRepsFor(match, human);
      outcome = human.reps > opponentReps ? "WIN" : human.reps < opponentReps ? "LOSS" : "DRAW";
    }

    const avgConfidence = human.reps > 0 ? human.confidenceSum / human.reps : null;

    try {
      const summary = await this.progression.applyMatchResult({
        userId: human.userId,
        matchId: match.id,
        exercise: match.exercise.id,
        outcome,
        reps: human.reps,
        opponentRating: this.opponentSummaryFor(match, human).rating,
        avgConfidence,
      });

      const participantUpdates = match.participants.map((p) => {
        if (p === human) {
          return this.prisma.matchParticipant.update({
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
          });
        }
        return this.prisma.matchParticipant.update({
          where: { id: p.participantId },
          data: { reps: p.reps, result: invert(outcome) },
        });
      });

      await this.prisma.$transaction([
        this.prisma.match.update({
          where: { id: match.id },
          data: {
            status: reason === "YOU_LEFT" ? "ABANDONED" : "COMPLETED",
            endedAt: new Date(),
            startedAt: match.startedAt ? new Date(match.startedAt) : null,
          },
        }),
        ...participantUpdates,
      ]);

      if (options.emit !== false) {
        human.connection.emit("match:end", {
          matchId: match.id,
          reason,
          opponentReps: this.opponentRepsFor(match, human),
          you: {
            reps: human.reps,
            outcome,
            ...summary,
          },
        } satisfies MatchEndPayload);
      }
    } catch (err) {
      this.logger.error(`Failed to finalize match ${match.id}: ${err}`);
      if (options.emit !== false) {
        human.connection.emit("error:game", { message: "Failed to save match result" });
      }
    }
  }
}
