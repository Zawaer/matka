// Form fields for saving a place: kind and size as segmented radio groups.
// No hooks, so they render in the place page's server form and in the map's
// client form alike; the values arrive as FormData "kind" and "radius".

import { KIND_META, PLACE_KINDS, PLACE_SIZES, type PlaceKind, formatRadius } from "@/lib/savedPlaces";

const SEGMENT =
  "flex h-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-xs font-medium text-muted transition-colors hover:text-text peer-checked:bg-primary/15 peer-checked:text-primary peer-checked:ring-1 peer-checked:ring-primary/50 peer-focus-visible:ring-2 peer-focus-visible:ring-primary";

export function KindPicker({ defaultValue, compact }: { defaultValue?: PlaceKind | null; compact?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-muted">Kind</legend>
      <div className="grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1">
        {PLACE_KINDS.map((k) => (
          <label key={k} className="cursor-pointer" title={KIND_META[k].hint}>
            <input
              type="radio"
              name="kind"
              value={k}
              defaultChecked={k === defaultValue}
              required
              className="peer sr-only"
            />
            <span className={SEGMENT}>
              <span className="text-lg leading-none" aria-hidden>
                {KIND_META[k].icon}
              </span>
              {KIND_META[k].label}
            </span>
          </label>
        ))}
      </div>
      {!compact && <p className="mt-1.5 text-xs text-muted">Home and Family both count as home for trips.</p>}
    </fieldset>
  );
}

export function SizePicker({ defaultValue, compact }: { defaultValue?: number | null; compact?: boolean }) {
  const value = defaultValue ?? PLACE_SIZES[0].radius;
  const custom = !PLACE_SIZES.some((s) => s.radius === value);
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-muted">Size</legend>
      <div className={`grid gap-1 rounded-xl bg-surface-2 p-1 ${custom ? "grid-cols-5" : "grid-cols-4"}`}>
        {PLACE_SIZES.map((s) => (
          <label key={s.key} className="cursor-pointer" title={s.hint}>
            <input
              type="radio"
              name="radius"
              value={s.radius}
              defaultChecked={s.radius === value}
              className="peer sr-only"
            />
            <span className={SEGMENT}>
              <span className="text-sm font-semibold leading-none">{s.label}</span>
              <span className="tabular-nums opacity-80">{formatRadius(s.radius)}</span>
            </span>
          </label>
        ))}
        {custom && (
          <label className="cursor-pointer" title="Set elsewhere">
            <input type="radio" name="radius" value={value} defaultChecked className="peer sr-only" />
            <span className={SEGMENT}>
              <span className="text-sm font-semibold leading-none">Own</span>
              <span className="tabular-nums opacity-80">{formatRadius(value)}</span>
            </span>
          </label>
        )}
      </div>
      {!compact && (
        <p className="mt-1.5 text-xs text-muted">
          Stays anywhere within it count as this place; a campus needs L.
        </p>
      )}
    </fieldset>
  );
}

/** "🏠 Home · 250 m" chip for a saved place. */
export function KindBadge({ kind, radius }: { kind: PlaceKind; radius?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
      <span aria-hidden>{KIND_META[kind].icon}</span>
      {KIND_META[kind].label}
      {radius ? <span className="opacity-75">· {formatRadius(radius)}</span> : null}
    </span>
  );
}
