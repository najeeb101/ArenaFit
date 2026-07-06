"use client";

import type { LeaderboardEntryDto } from "@arenafit/shared";
import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { useEffect, useState } from "react";
import { TierBadge } from "@/components/tier-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { cn, countryFlag } from "@/lib/utils";

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-[family-name:var(--font-display)] text-3xl font-bold">
        Leaderboard
      </h1>
      <p className="mb-6 text-sm text-muted">The best fighters in the arena.</p>

      <Tabs defaultValue="global">
        <TabsList>
          <TabsTrigger value="global">Global</TabsTrigger>
          <TabsTrigger value="weekly">This week</TabsTrigger>
        </TabsList>
        <TabsContent value="global">
          <Board board="global" />
        </TabsContent>
        <TabsContent value="weekly">
          <Board board="weekly" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Board({ board }: { board: "global" | "weekly" }) {
  const [entries, setEntries] = useState<LeaderboardEntryDto[] | null>(null);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    api<LeaderboardEntryDto[]>(`/leaderboard?board=${board}`)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [board]);

  if (entries === null) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted">
        No ranked battles {board === "weekly" ? "this week" : "yet"}. Be the first.
      </Card>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((e, i) => {
        const isYou = e.userId === userId;
        return (
          <motion.li
            key={e.userId}
            aria-label={`Rank ${e.rank}: ${e.displayName}, ${e.rating} rating${isYou ? " (you)" : ""}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.5) }}
            className={cn(
              "flex items-center gap-4 rounded-xl border px-4 py-3",
              isYou
                ? "border-primary/50 bg-primary/10"
                : "border-border bg-card hover:bg-card-hover",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "w-8 text-center font-[family-name:var(--font-display)] text-lg font-bold",
                e.rank === 1 && "text-gold",
                e.rank === 2 && "text-[#cbd5e1]",
                e.rank === 3 && "text-[#d97706]",
                e.rank > 3 && "text-muted",
              )}
            >
              {e.rank === 1 ? <Crown className="mx-auto h-5 w-5" /> : e.rank}
            </span>
            <div
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 font-bold text-primary"
            >
              {e.displayName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {countryFlag(e.country)} {e.displayName}
                {isYou && <span className="ml-2 text-xs text-primary">you</span>}
              </p>
              <p className="text-xs text-muted">
                LVL {e.level} · {e.wins}W {e.losses}L
              </p>
            </div>
            <TierBadge tier={e.tier} size="sm" className="hidden sm:inline-flex" />
            <div className="text-right">
              <p className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums">
                {e.rating}
              </p>
              {e.ratingGain !== undefined && (
                <p className={cn("text-xs font-semibold", e.ratingGain >= 0 ? "text-win" : "text-loss")}>
                  {e.ratingGain >= 0 ? "+" : ""}
                  {e.ratingGain} this week
                </p>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
