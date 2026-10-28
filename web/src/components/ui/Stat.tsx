import { cx } from "./cx";

/** "1,529 km" → the figure, then the unit smaller and muted. */
function withUnit(value: React.ReactNode) {
  if (typeof value !== "string") return value;
  const m = /^([\d.,\u00a0 ]*\d)\s([a-zA-Z%/]+)$/.exec(value);
  if (!m) return value;
  return (
    <>
      {m[1]}
      <span className="ml-1 text-sm font-medium tracking-normal text-muted">{m[2]}</span>
    </>
  );
}

/** A labelled number: the label above, the figure in tabular numerals. */
export function Stat({
  label,
  value,
  hint,
  className,
  card = true,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  /** In its own card (default), or bare inside another one. */
  card?: boolean;
}) {
  return (
    <div className={cx(card && "rounded-card border border-border bg-surface p-4 shadow-card", "min-w-0", className)}>
      <div className="truncate text-meta text-muted">{label}</div>
      <div className="mt-1 truncate text-stat tabular-nums text-text">{withUnit(value)}</div>
      {hint && <div className="mt-0.5 truncate text-caption text-muted">{hint}</div>}
    </div>
  );
}
