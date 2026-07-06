"use client";

import type { AuthResponse } from "@arenafit/shared";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<AuthResponse>("/auth/register", {
        method: "POST",
        body: { email, username, password },
        auth: false,
      });
      setAuth(res.user, res.tokens);
      router.push("/home");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.errors?.[0] ?? err.message);
      } else {
        setError("Could not reach the server");
      }
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-2xl font-[family-name:var(--font-display)]">
            Create your fighter
          </CardTitle>
          <CardDescription>
            One account, one ladder. Your username is your arena name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="RepReaper"
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
                title="Letters, numbers and underscores only"
                autoComplete="username"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
              <p className="text-xs text-muted/70">At least 8 characters.</p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-loss">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={loading} className="mt-2">
              {loading ? "Creating…" : "Enter the Arena"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted">
            Already fighting?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
