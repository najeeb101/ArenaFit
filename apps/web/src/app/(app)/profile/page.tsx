"use client";

import {
  EXERCISES,
  type AchievementDto,
  type MatchHistoryItemDto,
  type RatingPointDto,
} from "@arenafit/shared";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { MatchRow } from "@/components/match-row";
import { TierBadge } from "@/components/tier-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useProfileStore } from "@/lib/profile-store";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const profile = useProfileStore((s) => s.profile);
  const [ratings, setRatings] = useState<RatingPointDto[] | null>(null);
  const [achievements, setAchievements] = useState<AchievementDto[] | null>(null);
  const [history, setHistory] = useState<MatchHistoryItemDto[] | null>(null);

  useEffect(() => {
    api<RatingPointDto[]>("/users/me/rating-history").then(setRatings).catch(() => setRatings([]));
    api<AchievementDto[]>("/users/me/achievements")
      .then(setAchievements)
      .catch(() => setAchievements([]));
    api<MatchHistoryItemDto[]>("/users/me/matches?limit=10")
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  if (!profile) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const unlockedCount = achievements?.filter((a) => a.unlockedAt).length ?? 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 font-[family-name:var(--font-display)] text-4xl font-bold text-primary">
                {profile.displayName[0]?.toUpperCase()}
              </div>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-primary/40 bg-background px-2 py-0.5 text-[10px] font-bold text-primary">
                LVL {profile.level}
              </span>
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col items-center gap-2 sm:flex-row">
                <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
                  {profile.displayName}
                </h1>
                <TierBadge tier={profile.tier} />
              </div>
              <p className="mt-1 text-sm text-muted">
                @{profile.username} · fighting since{" "}
                {new Date(profile.createdAt).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <div className="mt-4 max-w-sm">
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>
                    {profile.xpIntoLevel}/{profile.xpForNextLevel} XP
                  </span>
                  <span>next: LVL {profile.level + 1}</span>
                </div>
                <Progress value={(profile.xpIntoLevel / profile.xpForNextLevel) * 100} />
              </div>
            </div>
            <div className="text-center">
              <p className="font-[family-name:var(--font-display)] text-4xl font-bold text-primary">
                {profile.rating}
              </p>
              <p className="text-xs uppercase tracking-wider text-muted">rating</p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat label="Wins" value={profile.wins} className="text-win" />
        <MiniStat label="Losses" value={profile.losses} className="text-loss" />
        <MiniStat label="Win streak" value={profile.winStreak} />
        <MiniStat
          label="Day streak"
          value={
            <span className="flex items-center justify-center gap-1">
              <Flame className="h-4 w-4 text-loss" /> {profile.currentStreak}
            </span>
          }
        />
        <MiniStat label="Best streak" value={profile.longestStreak} />
        <MiniStat label="Total reps" value={profile.totalReps.toLocaleString()} />
      </div>

      {/* Rating chart */}
      <Card>
        <CardHeader>
          <CardTitle>Rating history</CardTitle>
        </CardHeader>
        <CardContent>
          {ratings === null ? (
            <Skeleton className="h-32" />
          ) : ratings.length < 2 ? (
            <p className="py-8 text-center text-sm text-muted">
              Play a few ranked battles to see your rating curve.
            </p>
          ) : (
            <RatingSparkline points={ratings} />
          )}
        </CardContent>
      </Card>

      {/* Achievements */}
      <Card>
        <CardHeader>
          <CardTitle>
            Achievements{" "}
            <span className="text-sm font-normal text-muted">
              {unlockedCount}/{achievements?.length ?? 0}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {achievements === null ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {achievements.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    a.unlockedAt
                      ? "border-gold/30 bg-gold/5"
                      : "border-border bg-surface opacity-45",
                  )}
                  title={a.description}
                >
                  <span className="text-2xl">{a.icon}</span>
                  <p className="mt-1.5 text-sm font-semibold">{a.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.description}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Match history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {history === null ? (
            <Skeleton className="h-40" />
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No battles yet.</p>
          ) : (
            history.map((m) => <MatchRow key={m.id} match={m} />)
          )}
          {profile.favoriteExercise && (
            <p className="mt-2 text-center text-xs text-muted">
              Favorite exercise: {EXERCISES[profile.favoriteExercise].icon}{" "}
              {EXERCISES[profile.favoriteExercise].name}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className="p-3 text-center">
      <p className={cn("font-[family-name:var(--font-display)] text-xl font-bold", className)}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{label}</p>
    </Card>
  );
}

/** Dependency-free SVG rating curve. */
function RatingSparkline({ points }: { points: RatingPointDto[] }) {
  const w = 600;
  const h = 140;
  const pad = 8;
  const values = points.map((p) => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 20);

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p.rating - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${path} L${coords[coords.length - 1][0]},${h} L${coords[0][0]},${h} Z`;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full min-w-[320px]">
        <defs>
          <linearGradient id="rating-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#rating-fill)" />
        <path d={path} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" />
        <circle
          cx={coords[coords.length - 1][0]}
          cy={coords[coords.length - 1][1]}
          r="4"
          fill="#22d3ee"
        />
      </svg>
      <div className="flex justify-between text-xs text-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
