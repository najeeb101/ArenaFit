"use client";

import type {
  ExerciseId,
  MatchEndPayload,
  MatchFoundPayload,
  MatchModeId,
} from "@arenafit/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";

export type BattlePhase =
  | "connecting"
  | "queue"
  | "room-wait"
  | "found"
  | "verify"
  | "countdown"
  | "live"
  | "results"
  | "error";

export interface BattleState {
  phase: BattlePhase;
  match: MatchFoundPayload | null;
  /** Set while hosting a private room, waiting for a friend to join with the code. */
  roomCode: string | null;
  countdownValue: number | null;
  you: number;
  opponent: number;
  startedAt: number | null;
  end: MatchEndPayload | null;
  error: string | null;
  repRejected: boolean;
  /** You've requested a rematch; waiting on the other player. */
  rematchPending: boolean;
}

const INITIAL: BattleState = {
  phase: "connecting",
  match: null,
  roomCode: null,
  countdownValue: null,
  you: 0,
  opponent: 0,
  startedAt: null,
  end: null,
  error: null,
  repRejected: false,
  rematchPending: false,
};

/** Create a private-room invite, or join one with a friend's code — bypasses matchmaking entirely. */
export type RoomOption = { action: "create" } | { action: "join"; code: string };

/**
 * Socket-driven battle state machine:
 * connecting -> queue -> found -> verify -> countdown -> live -> results.
 * The "found" phase is a short VS splash before camera verification starts.
 * A private room inserts a "room-wait" phase before "found" for the host.
 */
export function useBattle(exercise: ExerciseId, mode: MatchModeId, room?: RoomOption) {
  const [state, setState] = useState<BattleState>(INITIAL);
  const matchIdRef = useRef<string | null>(null);
  // Latest state, visible to the effect's cleanup closure.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const socket = getSocket();

    const onFound = (payload: MatchFoundPayload) => {
      matchIdRef.current = payload.matchId;
      // Reset per-match fields (score, prior results, etc.) — this also
      // fires for a rematch arriving straight from the "results" phase.
      setState({ ...INITIAL, phase: "found", match: payload });
      // Give the VS splash a beat, then move to camera verification.
      setTimeout(() => {
        setState((s) => (s.phase === "found" ? { ...s, phase: "verify" } : s));
      }, 2600);
    };

    const onRoomCreated = ({ code }: { code: string }) =>
      setState((s) => ({ ...s, phase: "room-wait", roomCode: code }));

    const onRematchPending = () => setState((s) => ({ ...s, rematchPending: true }));

    const onCountdown = ({ value }: { matchId: string; value: number }) =>
      setState((s) => ({ ...s, phase: "countdown", countdownValue: value }));

    const onStart = ({ startedAt }: { startedAt: number }) =>
      setState((s) => ({ ...s, phase: "live", startedAt, countdownValue: null }));

    const onScore = ({ you, opponent }: { you: number; opponent: number }) =>
      setState((s) => ({ ...s, you, opponent }));

    const onRejected = () => {
      setState((s) => ({ ...s, repRejected: true }));
      setTimeout(() => setState((s) => ({ ...s, repRejected: false })), 900);
    };

    const onEnd = (payload: MatchEndPayload) =>
      setState((s) => ({
        ...s,
        phase: "results",
        end: payload,
        you: payload.you.reps,
        opponent: payload.opponentReps,
        rematchPending: false,
      }));

    const onGameError = ({ message }: { message: string }) =>
      setState((s) => ({ ...s, phase: "error", error: message }));

    const onConnectError = () =>
      setState((s) =>
        s.phase === "connecting"
          ? { ...s, phase: "error", error: "Could not connect to the arena server." }
          : s,
      );

    socket.on("match:found", onFound);
    socket.on("room:created", onRoomCreated);
    socket.on("match:rematch-pending", onRematchPending);
    socket.on("match:countdown", onCountdown);
    socket.on("match:start", onStart);
    socket.on("score:update", onScore);
    socket.on("rep:rejected", onRejected);
    socket.on("match:end", onEnd);
    socket.on("error:game", onGameError);
    socket.on("connect_error", onConnectError);

    const join = () => {
      if (room?.action === "create") {
        setState({ ...INITIAL, phase: "room-wait" });
        socket.emit("room:create", { exercise, mode });
      } else if (room?.action === "join") {
        setState({ ...INITIAL, phase: "queue" });
        socket.emit("room:join", { code: room.code });
      } else {
        setState({ ...INITIAL, phase: "queue" });
        socket.emit("queue:join", { exercise, mode });
      }
    };
    if (socket.connected) join();
    else {
      socket.once("connect", join);
      socket.connect();
    }

    return () => {
      socket.off("match:found", onFound);
      socket.off("room:created", onRoomCreated);
      socket.off("match:rematch-pending", onRematchPending);
      socket.off("match:countdown", onCountdown);
      socket.off("match:start", onStart);
      socket.off("score:update", onScore);
      socket.off("rep:rejected", onRejected);
      socket.off("match:end", onEnd);
      socket.off("error:game", onGameError);
      socket.off("connect_error", onConnectError);
      socket.off("connect", join);
      // Leaving mid-flow forfeits; the server also treats disconnect as a loss.
      if (matchIdRef.current && !["results", "error"].includes(stateRef.current.phase)) {
        socket.emit("match:forfeit", { matchId: matchIdRef.current });
      } else {
        socket.emit("queue:leave");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, mode, room?.action, room?.action === "join" ? room.code : undefined]);

  const sendReady = useCallback(() => {
    if (matchIdRef.current) getSocket().emit("match:ready", { matchId: matchIdRef.current });
  }, []);

  const sendRep = useCallback((confidence: number) => {
    if (matchIdRef.current) {
      getSocket().emit("rep:completed", {
        matchId: matchIdRef.current,
        clientTs: Date.now(),
        confidence,
      });
    }
  }, []);

  const sendRematch = useCallback(() => {
    if (matchIdRef.current) getSocket().emit("match:rematch", { matchId: matchIdRef.current });
  }, []);

  return { state, sendReady, sendRep, sendRematch };
}
