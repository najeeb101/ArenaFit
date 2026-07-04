"use client";

import type { AuthTokens, AuthUser } from "@arenafit/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  hydrated: boolean;
  setAuth(user: AuthUser, tokens: AuthTokens): void;
  setTokens(tokens: AuthTokens): void;
  clear(): void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      hydrated: false,
      setAuth: (user, tokens) => set({ user, tokens }),
      setTokens: (tokens) => set({ tokens }),
      clear: () => set({ user: null, tokens: null }),
    }),
    {
      name: "arenafit-auth",
      onRehydrateStorage: () => (state) => {
        // Mark hydration complete so route guards don't flash-redirect.
        useAuthStore.setState({ hydrated: true });
        void state;
      },
    },
  ),
);
