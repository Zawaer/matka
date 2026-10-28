import { cx } from "./cx";

/** "1,529 km", "12 d 3 h" → each figure, then its unit smaller and muted. */
export function withUnit(value: React.ReactNode) {
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
 * Several figures in one card, split by hairlines. Laid out by the card's own
 * width (a container query), not the viewport: three figures are always one
 * row (no orphan tile); four are 2×2 under 560 px of card width.
 */
export function StatStrip({
  items,
  className,
}: {
  items: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode }[];
  className?: string;
}) {
  const n = items.length;
  const cols = n >= 4 ? "grid-cols-2 @[35rem]:grid-cols-4" : n === 3 ? "grid-cols-3" : n === 2 ? "grid-cols-2" : "grid-cols-1";
  const narrow3 = n === 3;
  return (
    <div className={cx("@container", className)}>
      <dl className={cx("grid gap-px overflow-hidden rounded-card border border-border bg-border shadow-card", cols)}>
        {items.map((it, i) => (
          <div key={i} className={cx("min-w-0 bg-surface py-3.5", narrow3 ? "px-3 @[30rem]:px-4" : "px-4")}>
            <dt className={cx("truncate text-muted", narrow3 ? "text-caption @[30rem]:text-meta" : "text-meta")}>{it.label}</dt>
            <dd
              className={cx(
                "mt-1 truncate tabular-nums text-text",
                narrow3 ? "text-[1.25rem] font-semibold leading-7 tracking-[-0.02em] @[30rem]:text-stat" : "text-stat",
              )}
            >
              {withUnit(it.value)}
            </dd>
            {it.hint && <dd className="mt-0.5 truncate text-caption text-muted">{it.hint}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
