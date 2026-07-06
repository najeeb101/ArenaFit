"use client";

import { Flame, Home, Settings, Swords, Trophy, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { TierBadge } from "@/components/tier-badge";
import { useAuthStore } from "@/lib/auth-store";
import { useProfileStore } from "@/lib/profile-store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/battle", label: "Battle", icon: Swords },
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated } = useAuthStore();
  const { profile, fetchProfile } = useProfileStore();

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (user) void fetchProfile();
  }, [user, fetchProfile]);

  if (!hydrated || !user) {
    return (
      <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center">
        <Swords className="h-8 w-8 animate-pulse text-primary" aria-hidden="true" />
      </div>
    );
  }

  const inBattle = pathname === "/battle";

  return (
    <div className="arena-grid min-h-dvh">
      {/* Desktop sidebar */}
      {!inBattle && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface/70 backdrop-blur-xl md:flex">
          <Link
            href="/home"
            className="flex items-center gap-2 px-6 py-6 font-[family-name:var(--font-display)] text-xl font-bold"
          >
            <Swords className="h-6 w-6 text-primary" aria-hidden="true" />
            Arena<span className="text-primary">Fit</span>
          </Link>
          <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 px-3">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4.5 w-4.5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {profile && (
            <div className="border-t border-border p-4">
              <div className="flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 font-bold text-primary"
                >
                  {profile.displayName[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{profile.displayName}</p>
                  <TierBadge tier={profile.tier} size="sm" />
                </div>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Top stats bar */}
      {!inBattle && profile && (
        <header className="sticky top-0 z-20 flex items-center justify-end gap-4 border-b border-border bg-background/70 px-5 py-3 backdrop-blur-xl md:ml-60">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gold">
            <span aria-hidden="true" className="text-base">
              🪙
            </span>{" "}
            <span aria-label={`${profile.coins.toLocaleString()} coins`}>
              {profile.coins.toLocaleString()}
            </span>
          </span>
          <span
            aria-label={`${profile.currentStreak} day streak`}
            className={cn(
              "flex items-center gap-1 text-sm font-semibold",
              profile.currentStreak > 0 ? "text-loss" : "text-muted/50",
            )}
          >
            <Flame className="h-4 w-4" aria-hidden="true" /> {profile.currentStreak}
          </span>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
            LVL {profile.level}
          </span>
        </header>
      )}

      <main className={cn(!inBattle && "px-4 pb-24 pt-6 md:ml-60 md:px-8 md:pb-10")}>
        {children}
      </main>

      {/* Mobile bottom nav */}
      {!inBattle && (
        <nav
          aria-label="Main navigation"
          className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border bg-surface/85 backdrop-blur-xl md:hidden"
        >
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
