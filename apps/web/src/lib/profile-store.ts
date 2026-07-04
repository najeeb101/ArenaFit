"use client";

import type { ProfileDto } from "@arenafit/shared";
import { create } from "zustand";
import { api } from "./api";

interface ProfileState {
  profile: ProfileDto | null;
  loading: boolean;
  fetchProfile(): Promise<void>;
  clear(): void;
}

/** Lightweight client cache of the signed-in player's profile. */
export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  loading: false,
  fetchProfile: async () => {
    set({ loading: true });
    try {
      const profile = await api<ProfileDto>("/users/me/profile");
      set({ profile, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  clear: () => set({ profile: null }),
}));
