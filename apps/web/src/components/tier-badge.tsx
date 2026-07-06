import { TIERS, type TierId } from "@arenafit/shared";
import { cn } from "@/lib/utils";

export function TierBadge({
  tier,
  size = "default",
  className,
}: {
  tier: TierId;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const def = TIERS.find((t) => t.id === tier) ?? TIERS[0];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "default" && "px-2.5 py-0.5 text-xs",
        size === "lg" && "px-3.5 py-1 text-sm",
        className,
      )}
      style={{
        color: def.color,
        borderColor: `${def.color}55`,
        background: `${def.color}14`,
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: def.color, boxShadow: `0 0 8px ${def.color}` }}
      />
      {def.name}
    </span>
  );
}
