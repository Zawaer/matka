import Link from "next/link";
import { cx } from "./cx";

export type SegmentItem = {
  key: string;
  label: React.ReactNode;
  /** A link segment (server pages)… */
  href?: string;
  /** …or a button segment (client components). */
  onClick?: () => void;
};

/**
 * A row of mutually exclusive options: Travel / Trips / World, Countries / Cities,
 * Routes / Heatmap. The one segmented style in the app: the selected item is a
 * raised pill (white in light, surface-3 in dark), never a checkmark.
 */
export function Segmented({
  items,
  value,
  label,
  size = "md",
  disabled,
  className,
}: {
  items: SegmentItem[];
  value: string;
  /** Accessible name of the group. */
  label: string;
  size?: "sm" | "md";
  /** Nothing to switch between yet (button segments only). */
  disabled?: boolean;
  className?: string;
}) {
  const seg = (on: boolean) =>
    cx(
      "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium transition-colors sm:flex-none",
      size === "sm" ? "h-7 px-2.5 text-meta" : "h-8 px-3.5 text-sm",
      "disabled:cursor-not-allowed disabled:opacity-50",
      on ? "bg-seg-on text-text shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-border" : "text-muted enabled:hover:text-text [a&]:hover:text-text",
    );
  return (
    <nav aria-label={label} className={cx("inline-flex gap-0.5 rounded-control bg-surface-2 p-0.5", className)}>
      {items.map((it) => {
        const on = it.key === value;
        return it.href ? (
          <Link key={it.key} href={it.href} aria-current={on ? "page" : undefined} className={seg(on)}>
            {it.label}
          </Link>
        ) : (
          <button key={it.key} type="button" aria-pressed={on} onClick={it.onClick} disabled={disabled} className={seg(on)}>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
