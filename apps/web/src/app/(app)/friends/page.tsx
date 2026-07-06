"use client";

import type { FriendDto, FriendRequestDto } from "@arenafit/shared";
import { Check, Swords, UserPlus, UserX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { countryFlag } from "@/lib/utils";

export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendDto[] | null>(null);
  const [requests, setRequests] = useState<FriendRequestDto[] | null>(null);
  const [username, setUsername] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const refresh = () => {
    api<FriendDto[]>("/friends").then(setFriends).catch(() => setFriends([]));
    api<FriendRequestDto[]>("/friends/requests").then(setRequests).catch(() => setRequests([]));
  };

  useEffect(refresh, []);

  async function onSendRequest(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    try {
      await api("/friends/requests", { method: "POST", body: { username } });
      setMessage({ text: `Friend request sent to ${username}`, error: false });
      setUsername("");
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : "Could not send request", error: true });
    } finally {
      setSending(false);
    }
  }

  async function onAccept(id: string) {
    await api(`/friends/requests/${id}/accept`, { method: "POST" });
    refresh();
  }

  async function onDecline(id: string) {
    await api(`/friends/requests/${id}/decline`, { method: "POST" });
    refresh();
  }

  async function onRemove(friendshipId: string) {
    await api(`/friends/${friendshipId}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="mb-1 font-[family-name:var(--font-display)] text-3xl font-bold">Friends</h1>
        <p className="text-sm text-muted">
          Add friends, then start a private match from the home screen and share the room code.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a friend</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSendRequest} className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="friend-username">Username</Label>
              <Input
                id="friend-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="RepReaper"
                minLength={3}
                maxLength={20}
                required
              />
            </div>
            <Button type="submit" disabled={sending}>
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Send request
            </Button>
          </form>
          {message && (
            <p
              role={message.error ? "alert" : "status"}
              className={`mt-3 text-sm ${message.error ? "text-loss" : "text-win"}`}
            >
              {message.text}
            </p>
          )}
        </CardContent>
      </Card>

      {requests && requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Incoming requests</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">{r.displayName}</p>
                  <p className="text-xs text-muted">@{r.username}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onAccept(r.id)}>
                    <Check className="h-4 w-4" aria-hidden="true" /> Accept
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onDecline(r.id)}>
                    <X className="h-4 w-4" aria-hidden="true" /> Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your friends {friends ? `(${friends.length})` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {friends === null ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)
          ) : friends.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No friends yet — send a request above to get started.
            </p>
          ) : (
            friends.map((f) => (
              <div
                key={f.friendshipId}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-label={f.online ? "Online" : "Offline"}
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${f.online ? "bg-win" : "bg-muted/40"}`}
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      {countryFlag(f.country)} {f.displayName}
                    </p>
                    <p className="text-xs text-muted">
                      @{f.username} · LVL {f.level} · {f.rating} MMR
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TierBadge tier={f.tier} size="sm" className="hidden sm:inline-flex" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemove(f.friendshipId)}
                    aria-label={`Remove ${f.displayName} as a friend`}
                  >
                    <UserX className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted/70">
        <Swords className="h-3.5 w-3.5" aria-hidden="true" /> Start a private match from the home
        screen, then share the room code with a friend.
      </p>
    </div>
  );
}
