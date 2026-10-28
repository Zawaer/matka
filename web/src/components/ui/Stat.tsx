import { cx } from "./cx";

/** "1,529 km", "12 d 3 h" → each figure, then its unit smaller and muted. */
function withUnit(value: React.ReactNode) {
  if (typeof value !== "string") return value;
  if (!/^(?:[\d.,]*\d\s[a-zA-Z%/]+\s?)+$/.test(value)) return value;
  const pairs = [...value.matchAll(/([\d.,]*\d)\s([a-zA-Z%/]+)/g)];
  return (
    <>
      {pairs.map((m, i) => (
        <span key={i} className={i > 0 ? "ml-1.5" : undefined}>
          {m[1]}
          <span className="ml-1 text-sm font-medium tracking-normal text-muted">{m[2]}</span>
        </span>
      ))}
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

/**
 * Several figures in one card, split by hairlines: a 2×2 grid on phones, one
 * row from `sm` up. Cards are for groups, not for each number.
 */
export function StatStrip({
  items,
  className,
}: {
  items: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode }[];
  className?: string;
}) {
  const n = items.length;
  const cols = n >= 4 ? "sm:grid-cols-4" : n === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <dl
      className={cx(
        "grid grid-cols-2 overflow-hidden rounded-card border border-border bg-border shadow-card gap-px",
        cols,
        className,
      )}
    >
      {items.map((it, i) => (
        <div
          key={i}
          className={cx("min-w-0 bg-surface px-4 py-3.5", n % 2 === 1 && i === n - 1 && "col-span-2 sm:col-span-1")}
        >
          <dt className="truncate text-meta text-muted">{it.label}</dt>
          <dd className="mt-1 truncate text-stat tabular-nums text-text">{withUnit(it.value)}</dd>
          {it.hint && <dd className="mt-0.5 truncate text-caption text-muted">{it.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
