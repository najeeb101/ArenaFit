"use client";

import type { ProfileDto } from "@arenafit/shared";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useProfileStore } from "@/lib/profile-store";
import { destroySocket } from "@/lib/socket";

export default function SettingsPage() {
  const router = useRouter();
  const { tokens, clear } = useAuthStore();
  const { profile, fetchProfile, clear: clearProfile } = useProfileStore();
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setCountry(profile.country);
    }
  }, [profile]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api<ProfileDto>("/users/me/profile", {
        method: "PATCH",
        body: { displayName, country: country.toUpperCase() },
      });
      await fetchProfile();
      setSaved(true);
    } catch {
      setError("Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    try {
      if (tokens?.refreshToken) {
        await api("/auth/logout", { method: "POST", body: { refreshToken: tokens.refreshToken } });
      }
    } catch {
      /* best effort */
    }
    destroySocket();
    clearProfile();
    clear();
    router.replace("/login");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Fighter identity</CardTitle>
          <CardDescription>How you appear to opponents and on leaderboards.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                minLength={2}
                maxLength={30}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="country">Country code</Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="US"
                maxLength={2}
                pattern="[A-Za-z]{0,2}"
                className="w-24 uppercase"
              />
              <p className="text-xs text-muted/70">Two-letter code, shown as a flag (e.g. US, DE, JP).</p>
            </div>
            {error && <p className="text-sm text-loss">{error}</p>}
            {saved && <p className="text-sm text-win">Saved ✓</p>}
            <Button type="submit" disabled={saving} className="self-start">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Camera & privacy</CardTitle>
          <CardDescription>
            Pose tracking runs entirely in your browser. In solo battles, camera video never
            leaves your device — only rep events are sent to the server.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-loss/20">
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="danger" onClick={onLogout}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted/50">ArenaFit v0.1 · Milestone 1</p>
    </div>
  );
}
