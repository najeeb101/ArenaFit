export type TierId =
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "DIAMOND"
  | "MASTER"
  | "CHAMPION";

export interface TierDef {
  id: TierId;
  name: string;
  minRating: number;
  /** Tailwind-compatible accent used for badges. */
  color: string;
}

/** Ordered lowest to highest; a player's tier is the last entry they qualify for. */
export const TIERS: TierDef[] = [
  { id: "BRONZE", name: "Bronze", minRating: 0, color: "#b45309" },
  { id: "SILVER", name: "Silver", minRating: 1100, color: "#94a3b8" },
  { id: "GOLD", name: "Gold", minRating: 1250, color: "#eab308" },
  { id: "PLATINUM", name: "Platinum", minRating: 1400, color: "#67e8f9" },
  { id: "DIAMOND", name: "Diamond", minRating: 1550, color: "#818cf8" },
  { id: "MASTER", name: "Master", minRating: 1700, color: "#c084fc" },
  { id: "CHAMPION", name: "Champion", minRating: 1900, color: "#fb7185" },
];

export function tierForRating(rating: number): TierDef {
  let current = TIERS[0];
  for (const tier of TIERS) {
    if (rating >= tier.minRating) current = tier;
  }
  return current;
}
