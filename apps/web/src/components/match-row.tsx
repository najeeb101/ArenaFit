"use client";

import { EXERCISES, MATCH_MODES, type MatchHistoryItemDto } from "@arenafit/shared";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

export function MatchRow({ match }: { match: MatchHistoryItemDto }) {
  const won = match.outcome === "WIN";
  const draw = match.outcome === "DRAW";
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">{EXERCISES[match.exercise].icon}</span>
        <div>
          <p className="text-sm font-semibold">
            vs {match.opponentName}
            <span className="ml-2 text-xs font-normal text-muted">
              {match.yourReps}–{match.opponentReps}
            </span>
          </p>
          <p className="text-xs text-muted">
            {EXERCISES[match.exercise].name} · {MATCH_MODES[match.mode].name}
            {match.endedAt ? ` · ${formatDate(match.endedAt)}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {match.ratingDelta !== null && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-bold",
              match.ratingDelta >= 0 ? "text-win" : "text-loss",
            )}
          >
            {match.ratingDelta >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {match.ratingDelta >= 0 ? "+" : ""}
            {match.ratingDelta}
          </span>
        )}
        <span
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-bold",
            won && "bg-win/10 text-win",
            draw && "bg-white/5 text-muted",
            !won && !draw && "bg-loss/10 text-loss",
          )}
        >
          {match.outcome ?? "—"}
        </span>
      </div>
    </div>
  );
}
