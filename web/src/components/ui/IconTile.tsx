import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";

const SIZE = {
  sm: { box: "h-7 w-7 rounded-md", px: 16 },
  md: { box: "h-9 w-9 rounded-control", px: 20 },
  lg: { box: "h-12 w-12 rounded-card", px: 24 },
} as const;

/**
 * An icon on a quiet square: places, modes, settings sections. `color` tints
 * the glyph only (a mode's colour is a data mark, so it never fills the tile).
 */
export function IconTile({
  icon: I,
  size = "md",
  color,
  tone = "neutral",
  className,
  title,
}: {
  icon: LucideIcon;
  size?: keyof typeof SIZE;
  color?: string;
  tone?: "neutral" | "primary";
  className?: string;
  title?: string;
}) {
  const s = SIZE[size];
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={cx(
        "flex shrink-0 items-center justify-center",
        s.box,
        tone === "primary" ? "bg-primary/12 text-primary" : "bg-surface-2 text-secondary",
        className,
      )}
      style={color ? { color } : undefined}
    >
      <I size={s.px} strokeWidth={1.75} aria-hidden />
    </span>
  );
}
