import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { ProgressionService } from "../progression/progression.service";
import { MatchEngineService, type PlayerConnection } from "./match-engine.service";

interface FakeConnection extends PlayerConnection {
  events: { event: string; payload: unknown }[];
}

function makeConnection(id: string): FakeConnection {
  const events: { event: string; payload: unknown }[] = [];
  return {
    id,
    events,
    emit(event, payload) {
      events.push({ event, payload });
    },
  };
}

function makeEngine() {
  const prisma = {
    profile: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ rating: 1000 }),
    },
    match: {
      create: vi.fn().mockResolvedValue({
        id: "match-1",
        participants: [
          { id: "participant-player", userId: "user-1" },
          { id: "participant-bot", userId: null },
        ],
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    matchParticipant: { update: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const progression = {
    applyMatchResult: vi.fn().mockResolvedValue({
      xpEarned: 10,
      coinsEarned: 5,
      ratingBefore: 1000,
      ratingAfter: 1000,
      ratingDelta: 0,
      tier: "BRONZE",
      level: 1,
      leveledUp: false,
      calories: 1,
      unlockedAchievements: [],
    }),
  };
  const engine = new MatchEngineService(
    prisma as unknown as PrismaService,
    progression as unknown as ProgressionService,
  );
  return { engine, prisma, progression };
}

/** Joins the queue and flushes timers/microtasks until the match is created. */
async function joinAndFindMatch(engine: MatchEngineService, connection: FakeConnection) {
  engine.joinQueue(connection, "user-1", { exercise: "PUSHUP", mode: "TIMED_60" });
  await vi.advanceTimersByTimeAsync(8_001); // covers the full 2-8s queue delay
  const found = connection.events.find((e) => e.event === "match:found");
  const matchId = (found!.payload as { matchId: string }).matchId;
  return matchId;
}

async function readyAndGoActive(engine: MatchEngineService, connection: FakeConnection, matchId: string) {
  engine.ready(connection.id, matchId);
  await vi.advanceTimersByTimeAsync(3_001); // 3-2-1 countdown then match:start
}

describe("MatchEngineService disconnect handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not end the match immediately on disconnect, and resumes on reconnect within the grace window", async () => {
    const { engine, progression } = makeEngine();
    const connection = makeConnection("conn-1");
    const matchId = await joinAndFindMatch(engine, connection);
    await readyAndGoActive(engine, connection, matchId);

    engine.handleDisconnect(connection.id);
    await vi.advanceTimersByTimeAsync(5_000); // well within the 15s grace window
    expect(progression.applyMatchResult).not.toHaveBeenCalled();

    const reconnection = makeConnection("conn-2");
    const resumed = engine.reconnect(reconnection, "user-1");
    expect(resumed).toBe(true);
    expect(reconnection.events.some((e) => e.event === "match:start")).toBe(true);

    // The grace timer must have been cancelled — letting more time pass
    // shouldn't retroactively end the match.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(progression.applyMatchResult).not.toHaveBeenCalled();

    // The new connection is now the live one: reps should be accepted on it.
    engine.repCompleted(reconnection.id, { matchId, clientTs: Date.now(), confidence: 0.9 });
    expect(reconnection.events.some((e) => e.event === "score:update")).toBe(true);
  });

  it("scores a loss without emitting to the dead socket once the grace window elapses", async () => {
    const { engine, progression, prisma } = makeEngine();
    const connection = makeConnection("conn-1");
    const matchId = await joinAndFindMatch(engine, connection);
    await readyAndGoActive(engine, connection, matchId);

    engine.handleDisconnect(connection.id);
    await vi.advanceTimersByTimeAsync(15_001);

    expect(progression.applyMatchResult).toHaveBeenCalledTimes(1);
    expect(prisma.match.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ABANDONED" }) }),
    );
    // emit: false — the disconnected socket should never receive match:end.
    expect(connection.events.some((e) => e.event === "match:end")).toBe(false);

    // A reconnect attempt after the match has already been finalized should fail.
    const late = makeConnection("conn-late");
    expect(engine.reconnect(late, "user-1")).toBe(false);
  });

  it("abandons a match if the player never hits ready (no camera-permission hang)", async () => {
    const { engine, progression } = makeEngine();
    const connection = makeConnection("conn-1");
    await joinAndFindMatch(engine, connection);

    await vi.advanceTimersByTimeAsync(45_001);

    expect(progression.applyMatchResult).toHaveBeenCalledTimes(1);
    // Unlike the disconnect-grace case, the player is still connected here,
    // so the client should be told the match ended.
    expect(connection.events.some((e) => e.event === "match:end")).toBe(true);
  });
});

describe("MatchEngineService WebRTC signal relay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a no-op in today's solo-vs-bot matches — there's no other human to relay to", async () => {
    const { engine } = makeEngine();
    const connection = makeConnection("conn-1");
    const matchId = await joinAndFindMatch(engine, connection);

    // Should not throw, and should not somehow echo the signal back to the sender.
    engine.relaySignal(connection.id, matchId, "webrtc:offer", { matchId, data: "sdp" });
    expect(connection.events.some((e) => e.event === "webrtc:offer")).toBe(false);
  });

  it("ignores signals from a connection that isn't a participant in the match", async () => {
    const { engine } = makeEngine();
    const connection = makeConnection("conn-1");
    const matchId = await joinAndFindMatch(engine, connection);

    const stranger = makeConnection("conn-stranger");
    expect(() =>
      engine.relaySignal(stranger.id, matchId, "webrtc:offer", { matchId, data: "sdp" }),
    ).not.toThrow();
  });
});
