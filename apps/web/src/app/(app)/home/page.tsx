"use client";

import {
  EXERCISE_IDS,
  EXERCISES,
  isValidPairing,
  MATCH_MODE_IDS,
  MATCH_MODES,
  type ExerciseId,
  type MatchHistoryItemDto,
  type MatchModeId,
} from "@arenafit/shared";
import { motion } from "framer-motion";
import { Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MatchRow } from "@/components/match-row";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useProfileStore } from "@/lib/profile-store";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const [exercise, setExercise] = useState<ExerciseId>("PUSHUP");
  const [mode, setMode] = useState<MatchModeId>("TIMED_60");
  const [history, setHistory] = useState<MatchHistoryItemDto[] | null>(null);

  useEffect(() => {
    api<MatchHistoryItemDto[]>("/users/me/matches?limit=5")
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (!isValidPairing(exercise, mode)) setMode("TIMED_60");
  }, [exercise, mode]);

  const winRate =
    profile && profile.wins + profile.losses > 0
      ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
      : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Find match hero */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-display)] text-2xl">
              Ready to battle{profile ? `, ${profile.displayName}` : ""}?
            </CardTitle>
            <p className="text-sm text-muted">Pick your weapon and find an opponent.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Exercise
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {EXERCISE_IDS.map((id) => (
                  <button
                    key={id}
                    onClick={() => setExercise(id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      exercise === id
                        ? "border-primary/60 bg-primary/10 shadow-[0_0_20px_rgb(34_211_238/0.15)]"
                        : "border-border bg-surface hover:border-border-strong",
                    )}
                  >
                    <span className="text-xl">{EXERCISES[id].icon}</span>
                    <p className="mt-1 text-sm font-semibold">{EXERCISES[id].name}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Mode
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {MATCH_MODE_IDS.map((id) => {
                  const disabled = !isValidPairing(exercise, id);
                  return (
                    <button
                      key={id}
                      disabled={disabled}
                      onClick={() => setMode(id)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all disabled:opacity-30",
                        mode === id
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-surface hover:border-border-strong",
                      )}
                    >
                      <p className="text-sm font-semibold">{MATCH_MODES[id].name}</p>
                      <p className="mt-0.5 text-xs text-muted">{MATCH_MODES[id].description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <Button
              size="xl"
              className="w-full animate-pulse-glow sm:w-auto"
              onClick={() => router.push(`/battle?exercise=${exercise}&mode=${mode}`)}
            >
              <Swords className="h-5 w-5" /> Find Match
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {profile ? (
          <>
            <StatCard label="Rating">
              <div className="flex items-center gap-2">
                <span className="font-[family-name:var(--font-display)] text-2xl font-bold">
                  {profile.rating}
                </span>
                <TierBadge tier={profile.tier} size="sm" />
              </div>
            </StatCard>
            <StatCard label="Record">
              <span className="font-[family-name:var(--font-display)] text-2xl font-bold">
                <span className="text-win">{profile.wins}W</span>
                <span className="mx-1 text-muted/40">·</span>
                <span className="text-loss">{profile.losses}L</span>
              </span>
              {winRate !== null && <p className="text-xs text-muted">{winRate}% win rate</p>}
            </StatCard>
            <StatCard label="Total reps">
              <span className="font-[family-name:var(--font-display)] text-2xl font-bold">
                {profile.totalReps.toLocaleString()}
              </span>
            </StatCard>
            <StatCard label={`Level ${profile.level}`}>
              <Progress
                value={(profile.xpIntoLevel / profile.xpForNextLevel) * 100}
                className="mt-2"
              />
              <p className="mt-1.5 text-xs text-muted">
                {profile.xpIntoLevel}/{profile.xpForNextLevel} XP
              </p>
            </StatCard>
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        )}
      </div>

      {/* Recent matches */}
      <Card>
        <CardHeader>
          <CardTitle>Recent battles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {history === null ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No battles yet. Your history will appear here — go claim your first win.
            </p>
          ) : (
            history.map((m) => <MatchRow key={m.id} match={m} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-1">{children}</div>
    </Card>
  );
}
