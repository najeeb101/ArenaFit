"use client";

import {
  EXERCISES,
  MATCH_MODES,
  type ExerciseId,
  type MatchModeId,
} from "@arenafit/shared";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Copy, Loader2, RefreshCw, Swords, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBattle, type RoomOption } from "@/hooks/use-battle";
import { usePose, type PoseMode } from "@/hooks/use-pose";
import { useAuthStore } from "@/lib/auth-store";
import { useProfileStore } from "@/lib/profile-store";
import { cn, countryFlag } from "@/lib/utils";

export default function BattlePage() {
  // Bumping this key fully remounts <Battle>, restarting the join flow
  // without a hard page reload (used by "queue again" / a failed retry).
  const [instanceKey, setInstanceKey] = useState(0);
  return (
    <Suspense>
      <Battle key={instanceKey} onRestart={() => setInstanceKey((k) => k + 1)} />
    </Suspense>
  );
}

function Battle({ onRestart }: { onRestart: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const exercise = (params.get("exercise") as ExerciseId) || "PUSHUP";
  const mode = (params.get("mode") as MatchModeId) || "TIMED_60";
  const privateAction = params.get("private");
  const roomCodeParam = params.get("code");
  const room: RoomOption | undefined =
    privateAction === "create"
      ? { action: "create" }
      : privateAction === "join" && roomCodeParam
        ? { action: "join", code: roomCodeParam }
        : undefined;

  const { state, sendReady, sendRep, sendRematch } = useBattle(exercise, mode, room);
  // Once matched, the server is authoritative on exercise/mode — matters for
  // a room-join, where the guest doesn't choose either themselves.
  const activeExercise = state.match?.exercise ?? exercise;
  const activeMode = state.match?.mode ?? mode;
  const poseMode: PoseMode =
    state.phase === "verify" || state.phase === "countdown"
      ? "verify"
      : state.phase === "live"
        ? "count"
        : "off";
  const pose = usePose(activeExercise, poseMode, sendRep);
  const fetchProfile = useProfileStore((s) => s.fetchProfile);

  // Signal readiness exactly once per match after verification passes.
  const readySentRef = useRef(false);
  useEffect(() => {
    if (state.phase === "verify" && pose.verified && !readySentRef.current) {
      readySentRef.current = true;
      sendReady();
    }
    if (state.phase === "queue" || state.phase === "room-wait") readySentRef.current = false;
  }, [state.phase, pose.verified, sendReady]);

  // Refresh coins/level/rating in the shell after a battle.
  useEffect(() => {
    if (state.phase === "results") void fetchProfile();
  }, [state.phase, fetchProfile]);

  const exerciseDef = EXERCISES[activeExercise];
  const modeDef = MATCH_MODES[activeMode];
  const showCamera = ["verify", "countdown", "live"].includes(state.phase);
  const isHumanOpponent = state.match ? state.match.opponent.userId !== null : false;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => router.push("/home")}
          aria-label={
            state.phase === "results" ? "Back home" : state.phase === "live" ? "Forfeit match" : "Leave queue"
          }
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:bg-white/5 hover:text-foreground"
        >
          {state.phase === "results" ? (
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          ) : (
            <X className="h-4 w-4" aria-hidden="true" />
          )}
          {state.phase === "results" ? "Back home" : state.phase === "live" ? "Forfeit" : "Leave"}
        </button>
        <div className="text-sm font-semibold text-muted">
          {exerciseDef.icon} {exerciseDef.name} · {modeDef.name}
        </div>
        <div className="w-16" />
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Camera stage — mounted across verify/countdown/live */}
        {showCamera && (
          <div className="relative flex-1">
            <video
              ref={pose.videoRef}
              playsInline
              muted
              aria-hidden="true"
              className="mirrored absolute inset-0 h-full w-full object-cover"
            />
            <canvas
              ref={pose.canvasRef}
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />

            {state.phase === "verify" && (
              <VerifyOverlay
                cameraState={pose.cameraState}
                cameraError={pose.cameraError}
                progress={pose.verifyProgress}
                verified={pose.verified}
                feedback={pose.feedback}
                setup={exerciseDef.setup}
              />
            )}

            {state.phase === "countdown" && state.countdownValue !== null && (
              <div
                role="status"
                aria-live="assertive"
                className="absolute inset-0 flex items-center justify-center"
              >
                <motion.span
                  key={state.countdownValue}
                  initial={{ scale: 2.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="font-[family-name:var(--font-display)] text-7xl font-bold text-primary text-glow sm:text-8xl md:text-9xl"
                >
                  {state.countdownValue}
                </motion.span>
              </div>
            )}

            {state.phase === "live" && state.startedAt && state.match && (
              <LiveHud
                you={state.you}
                opponent={state.opponent}
                opponentName={state.match.opponent.displayName}
                startedAt={state.startedAt}
                durationSec={state.match.durationSec}
                targetReps={state.match.targetReps}
                feedback={pose.feedback}
                repRejected={state.repRejected}
              />
            )}
          </div>
        )}

        {/* Non-camera phases */}
        <AnimatePresence mode="wait">
          {(state.phase === "connecting" || state.phase === "queue") && (
            <QueueView key="queue" exercise={activeExercise} mode={activeMode} />
          )}
          {state.phase === "room-wait" && <RoomWaitView key="room-wait" code={state.roomCode} />}
          {state.phase === "found" && state.match && (
            <FoundView key="found" match={state.match} />
          )}
          {state.phase === "results" && state.end && (
            <ResultsView
              key="results"
              end={state.end}
              opponentName={state.match?.opponent.displayName ?? "Opponent"}
              isHumanOpponent={isHumanOpponent}
              rematchPending={state.rematchPending}
              onRematch={sendRematch}
              onRequeue={onRestart}
              onHome={() => router.push("/home")}
            />
          )}
          {state.phase === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
            >
              <p role="alert" className="text-lg font-semibold text-loss">
                {state.error}
              </p>
              <Button onClick={onRestart}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------------------------------- Queue --------------------------------- */

function QueueView({ exercise, mode }: { exercise: ExerciseId; mode: MatchModeId }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 flex-col items-center justify-center gap-8 px-6"
    >
      <div className="relative flex h-44 w-44 items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-primary/40"
            animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.7, ease: "easeOut" }}
          />
        ))}
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-4xl">
          {EXERCISES[exercise].icon}
        </div>
      </div>
      <div role="status" className="text-center">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Searching for an opponent…
        </h2>
        <p className="mt-2 text-sm text-muted">
          {EXERCISES[exercise].name} · {MATCH_MODES[mode].name} ·{" "}
          {String(Math.floor(elapsed / 60)).padStart(1, "0")}:
          {String(elapsed % 60).padStart(2, "0")}
        </p>
      </div>
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
    </motion.div>
  );
}

/* ------------------------------ Private room ------------------------------ */

function RoomWaitView({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the code is still visible to copy by hand */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        Share this code with a friend
      </h2>
      {code ? (
        <button
          onClick={onCopy}
          aria-label={`Room code ${code.split("").join(" ")}, click to copy`}
          className="glass flex items-center gap-3 rounded-2xl px-6 py-4 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[0.3em] text-primary transition-transform active:scale-95"
        >
          {code}
          {copied ? (
            <Check className="h-6 w-6 text-win" aria-hidden="true" />
          ) : (
            <Copy className="h-6 w-6 text-muted" aria-hidden="true" />
          )}
        </button>
      ) : (
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      )}
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Waiting for your friend to
        join…
      </p>
    </motion.div>
  );
}

/* ------------------------------- Match found ------------------------------ */

function FoundView({ match }: { match: import("@arenafit/shared").MatchFoundPayload }) {
  const user = useAuthStore((s) => s.user);
  const profile = useProfileStore((s) => s.profile);
  const opp = match.opponent;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 items-center justify-center px-6"
    >
      <div className="flex w-full max-w-lg items-center justify-between gap-4">
        <PlayerCard
          name={profile?.displayName ?? user?.username ?? "You"}
          rating={profile?.rating ?? 1000}
          tier={profile?.tier ?? "BRONZE"}
          level={profile?.level ?? 1}
          country={profile?.country ?? ""}
          side="left"
        />
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.3 }}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/15 font-[family-name:var(--font-display)] text-xl font-bold text-primary text-glow"
        >
          VS
        </motion.div>
        <PlayerCard
          name={opp.displayName}
          rating={opp.rating}
          tier={opp.tier}
          level={opp.level}
          country={opp.country}
          side="right"
        />
      </div>
    </motion.div>
  );
}

function PlayerCard({
  name,
  rating,
  tier,
  level,
  country,
  side,
}: {
  name: string;
  rating: number;
  tier: React.ComponentProps<typeof TierBadge>["tier"];
  level: number;
  country: string;
  side: "left" | "right";
}) {
  return (
    <motion.div
      initial={{ x: side === "left" ? -80 : 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="glass flex flex-1 flex-col items-center gap-2 rounded-2xl p-5 text-center"
    >
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary"
      >
        {name[0]?.toUpperCase()}
      </div>
      <p className="max-w-full truncate font-semibold">
        {countryFlag(country)} {name}
      </p>
      <TierBadge tier={tier} size="sm" />
      <p className="text-xs text-muted">
        {rating} MMR · LVL {level}
      </p>
    </motion.div>
  );
}

/* ------------------------------ Verify overlay ---------------------------- */

function VerifyOverlay({
  cameraState,
  cameraError,
  progress,
  verified,
  feedback,
  setup,
}: {
  cameraState: string;
  cameraError: string | null;
  progress: number;
  verified: boolean;
  feedback: string | null;
  setup: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 flex flex-col items-center justify-end gap-3 pb-10"
    >
      {cameraState === "starting" && (
        <div className="glass flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> Starting
          camera & AI referee…
        </div>
      )}
      {cameraState === "error" && (
        <div role="alert" className="glass max-w-sm rounded-xl px-4 py-3 text-center text-sm text-loss">
          {cameraError}
        </div>
      )}
      {cameraState === "ready" && (
        <>
          <div className="glass max-w-sm rounded-xl px-4 py-2 text-center text-xs text-muted">
            {setup}
          </div>
          <div className="glass w-64 rounded-xl px-4 py-3 text-center">
            {verified ? (
              <p className="text-sm font-semibold text-win">
                ✓ Verified — waiting for opponent…
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm font-semibold">
                  {feedback ?? "Hold still — verifying your pose"}
                </p>
                <Progress value={progress * 100} aria-label="Pose verification progress" />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------- Live HUD ------------------------------- */

function LiveHud({
  you,
  opponent,
  opponentName,
  startedAt,
  durationSec,
  targetReps,
  feedback,
  repRejected,
}: {
  you: number;
  opponent: number;
  opponentName: string;
  startedAt: number;
  durationSec: number;
  targetReps: number | null;
  feedback: string | null;
  repRejected: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, durationSec - (now - startedAt) / 1000);
  const timePct = (remaining / durationSec) * 100;
  const leading = you > opponent;

  return (
    <div className="absolute inset-0 flex flex-col justify-between">
      {/* Timer */}
      <div className="px-4 pt-2">
        <div className="mx-auto max-w-xl">
          <div className="mb-1 flex items-baseline justify-between">
            <span
              role="timer"
              aria-label={`${Math.ceil(remaining)} seconds remaining`}
              className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums"
            >
              {Math.ceil(remaining)}s
            </span>
            {targetReps && (
              <span className="text-xs font-semibold text-muted">first to {targetReps}</span>
            )}
          </div>
          <Progress
            value={timePct}
            aria-label="Time remaining"
            indicatorClassName={cn(remaining < 10 && "bg-loss")}
          />
        </div>
      </div>

      {/* Feedback + scores */}
      <div className="flex flex-col items-center gap-4 pb-8">
        <div role="status" aria-live="polite" className="contents">
          <AnimatePresence>
            {feedback && (
              <motion.div
                key={feedback}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="glass rounded-xl px-4 py-2 text-sm font-semibold text-gold"
              >
                {feedback}
              </motion.div>
            )}
            {repRejected && (
              <motion.div
                key="rejected"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-xl bg-loss/20 px-4 py-2 text-sm font-bold text-loss"
              >
                Rep rejected
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          role="group"
          aria-label={`Score: you ${you}, ${opponentName} ${opponent}`}
          className="flex w-full max-w-xl items-end justify-between px-6"
        >
          <div className="text-center">
            <motion.p
              key={you}
              initial={{ scale: 1.35 }}
              animate={{ scale: 1 }}
              aria-hidden="true"
              className={cn(
                "font-[family-name:var(--font-display)] text-5xl font-bold tabular-nums sm:text-6xl md:text-7xl",
                leading ? "text-win" : "text-foreground",
              )}
            >
              {you}
            </motion.p>
            <p aria-hidden="true" className="mt-1 text-xs font-bold uppercase tracking-wider text-primary">
              You
            </p>
          </div>
          <Swords className="mb-8 h-6 w-6 text-muted/40" aria-hidden="true" />
          <div className="text-center">
            <motion.p
              key={opponent}
              initial={{ scale: 1.35 }}
              animate={{ scale: 1 }}
              aria-hidden="true"
              className={cn(
                "font-[family-name:var(--font-display)] text-5xl font-bold tabular-nums sm:text-6xl md:text-7xl",
                opponent > you ? "text-loss" : "text-foreground",
              )}
            >
              {opponent}
            </motion.p>
            <p
              aria-hidden="true"
              className="mt-1 max-w-24 truncate text-xs font-bold uppercase tracking-wider text-muted"
            >
              {opponentName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Results -------------------------------- */

function ResultsView({
  end,
  opponentName,
  isHumanOpponent,
  rematchPending,
  onRematch,
  onRequeue,
  onHome,
}: {
  end: NonNullable<ReturnType<typeof useBattle>["state"]["end"]>;
  opponentName: string;
  isHumanOpponent: boolean;
  rematchPending: boolean;
  onRematch: () => void;
  onRequeue: () => void;
  onHome: () => void;
}) {
  const you = end.you;
  const won = you.outcome === "WIN";
  const draw = you.outcome === "DRAW";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-8"
    >
      <motion.h1
        role="status"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className={cn(
          "font-[family-name:var(--font-display)] text-6xl font-bold md:text-7xl",
          won && "text-win",
          draw && "text-foreground",
          !won && !draw && "text-loss",
        )}
        style={{ textShadow: won ? "0 0 40px rgb(163 230 53 / 0.5)" : undefined }}
      >
        {won ? "VICTORY" : draw ? "DRAW" : "DEFEAT"}
      </motion.h1>

      <p className="text-sm text-muted">
        {end.reason === "YOU_LEFT"
          ? "You left the match."
          : end.reason === "OPPONENT_LEFT"
            ? `${opponentName} left the match.`
            : `${you.reps} – ${end.opponentReps} vs ${opponentName}`}
      </p>

      <div className="glass w-full max-w-md rounded-2xl p-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <ResultStat label="XP" value={`+${you.xpEarned}`} accent="text-primary" />
          <ResultStat label="Coins" value={`+${you.coinsEarned}`} accent="text-gold" />
          <ResultStat
            label="Rating"
            value={`${you.ratingDelta >= 0 ? "+" : ""}${you.ratingDelta}`}
            accent={you.ratingDelta >= 0 ? "text-win" : "text-loss"}
          />
        </div>
        <div className="mt-5 flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
          <span className="text-sm text-muted">New rating</span>
          <span className="flex items-center gap-2 font-bold">
            {you.ratingAfter} <TierBadge tier={you.tier} size="sm" />
          </span>
        </div>
        {you.leveledUp && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-3 text-center text-sm font-bold text-primary"
          >
            ⬆ Level up! You are now level {you.level}
          </motion.p>
        )}
        {you.calories > 0 && (
          <p className="mt-3 text-center text-xs text-muted">
            ~{you.calories} kcal burned this battle
          </p>
        )}
      </div>

      {you.unlockedAchievements.length > 0 && (
        <div className="w-full max-w-md">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-muted">
            Achievements unlocked
          </p>
          <ul className="flex flex-col gap-2">
            {you.unlockedAchievements.map((a, i) => (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.15 }}
                className="glass flex items-center gap-3 rounded-xl px-4 py-3"
              >
                <span aria-hidden="true" className="text-2xl">
                  {a.icon}
                </span>
                <div>
                  <p className="text-sm font-bold text-gold">{a.name}</p>
                  <p className="text-xs text-muted">{a.description}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-3">
          {isHumanOpponent ? (
            <Button size="lg" onClick={onRematch} disabled={rematchPending}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {rematchPending ? "Waiting for opponent…" : `Rematch ${opponentName}`}
            </Button>
          ) : (
            <Button size="lg" onClick={onRequeue}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Queue again
            </Button>
          )}
          <Button size="lg" variant="secondary" onClick={onHome}>
            Home
          </Button>
        </div>
        {isHumanOpponent && rematchPending && (
          <p role="status" className="text-xs text-muted">
            Waiting for {opponentName} to also request a rematch…
          </p>
        )}
      </div>
      <Link href="/leaderboard" className="text-xs text-muted hover:text-primary">
        See where you rank →
      </Link>
    </motion.div>
  );
}

function ResultStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <p className={cn("font-[family-name:var(--font-display)] text-2xl font-bold", accent)}>
        {value}
      </p>
      <p className="mt-0.5 text-xs uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
