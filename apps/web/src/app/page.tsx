"use client";

import { EXERCISES } from "@arenafit/shared";
import { motion } from "framer-motion";
import { Activity, Camera, Swords, Trophy, Users, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5 },
};

const FEATURES = [
  {
    icon: Camera,
    title: "AI rep counting",
    text: "Your camera + on-device pose tracking counts every clean rep. Half reps don't count — form matters.",
  },
  {
    icon: Swords,
    title: "Live 1v1 battles",
    text: "Queue up, get matched in seconds, and race an opponent through push-ups, squats, jacks, or planks.",
  },
  {
    icon: Trophy,
    title: "Ranked ladder",
    text: "Elo-based MMR from Bronze to Champion. Every battle moves your rating — climb the global board.",
  },
  {
    icon: Zap,
    title: "XP, coins & streaks",
    text: "Level up, unlock achievements, and keep your daily streak alive. Consistency is the real win.",
  },
  {
    icon: Activity,
    title: "Form coaching",
    text: "Live cues while you battle: go lower, lock out, straighten your plank. The AI referee is also your coach.",
  },
  {
    icon: Users,
    title: "Built for rivalry",
    text: "Add friends, challenge them directly in a private room, and rematch instantly — no reload, no requeue.",
  },
];

export default function LandingPage() {
  return (
    <main className="arena-grid min-h-dvh overflow-x-hidden">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-bold">
          <Swords className="h-6 w-6 text-primary" />
          Arena<span className="text-primary">Fit</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 text-center md:pt-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-105 w-105 rounded-full bg-primary/5 blur-[100px]" />
        <motion.p
          {...fadeUp}
          className="mx-auto mb-5 w-fit rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold tracking-wide text-primary"
        >
          LIVE FITNESS BATTLES · AI REFEREED
        </motion.p>
        <motion.h1
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mx-auto max-w-3xl font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.05] md:text-7xl"
        >
          Compete. Improve. <span className="text-primary text-glow">Dominate.</span>
        </motion.h1>
        <motion.p
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-6 max-w-xl text-lg text-muted"
        >
          Working out alone is boring. ArenaFit matches you against a real rival, turns on your
          camera, and counts every rep with AI. Winner takes the rating.
        </motion.p>
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button size="xl" className="animate-pulse-glow" asChild>
            <Link href="/register">
              <Swords className="h-5 w-5" /> Enter the Arena
            </Link>
          </Button>
          <Button size="xl" variant="secondary" asChild>
            <Link href="/login">I have an account</Link>
          </Button>
        </motion.div>

        {/* Exercise chips */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-14 flex flex-wrap items-center justify-center gap-3"
        >
          {Object.values(EXERCISES).map((e) => (
            <span
              key={e.id}
              className="glass rounded-full px-4 py-2 text-sm font-medium text-foreground/90"
            >
              {e.icon} {e.name}
            </span>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.h2
          {...fadeUp}
          className="text-center font-[family-name:var(--font-display)] text-3xl font-bold md:text-4xl"
        >
          From couch to combat in <span className="text-primary">10 seconds</span>
        </motion.h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["01", "Find a match", "Pick an exercise and mode. Matchmaking pairs you with an opponent near your skill level."],
            ["02", "Verify & count down", "Your camera checks you're in frame and ready. 3… 2… 1…"],
            ["03", "Out-rep them", "Live scores, live coaching, one winner. Claim XP, coins, and rating."],
          ].map(([step, title, text], i) => (
            <motion.div
              key={step}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="glass rounded-2xl p-6"
            >
              <div className="font-[family-name:var(--font-display)] text-4xl font-bold text-primary/40">
                {step}
              </div>
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              {...fadeUp}
              transition={{ duration: 0.45, delay: (i % 3) * 0.07 }}
              className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/30 hover:bg-card-hover"
            >
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-6 pb-28 text-center">
        <motion.div {...fadeUp} className="glass rounded-3xl p-10 md:p-14">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold md:text-4xl">
            Your rival is already warming up.
          </h2>
          <p className="mt-4 text-muted">
            Free to play. No equipment. Just you, your camera, and someone to beat.
          </p>
          <Button size="xl" className="mt-8" asChild>
            <Link href="/register">Create free account</Link>
          </Button>
        </motion.div>
        <p className="mt-10 text-xs text-muted/60">
          ArenaFit · Pose tracking runs on your device — battle video never leaves your browser in
          solo mode.
        </p>
      </section>
    </main>
  );
}
