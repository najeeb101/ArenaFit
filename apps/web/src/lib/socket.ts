"use client";

import type { ClientToServerEvents, ServerToClientEvents } from "@arenafit/shared";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";
import { useAuthStore } from "./auth-store";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** Lazily create one authenticated socket per tab. */
export function getSocket(): GameSocket {
  if (socket?.connected) return socket;
  socket?.disconnect();
  socket = io(API_URL, {
    transports: ["websocket"],
    auth: (cb) => cb({ token: useAuthStore.getState().tokens?.accessToken }),
  });
  return socket;
}

export function destroySocket(): void {
  socket?.disconnect();
  socket = null;
}
