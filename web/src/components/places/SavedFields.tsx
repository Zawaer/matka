// Form fields for saving a place: kind and size as segmented radio groups.
// No hooks, so they render in the place page's server form and in the map's
// client form alike; the values arrive as FormData "kind" and "radius".

import { KIND_META, PLACE_KINDS, PLACE_SIZES, type PlaceKind, formatRadius } from "@/lib/savedPlaces";
import { Badge, KIND_ICONS } from "@/components/ui";

const SEGMENT =
  "flex h-full flex-col items-center justify-center gap-1 rounded-[6px] px-1 py-2 text-caption font-medium text-muted transition-colors hover:text-text peer-checked:bg-surface peer-checked:text-text peer-checked:shadow-[0_1px_2px_rgba(0,0,0,0.12)] peer-checked:ring-1 peer-checked:ring-border peer-focus-visible:ring-2 peer-focus-visible:ring-primary";

export function KindPicker({ defaultValue, compact }: { defaultValue?: PlaceKind | null; compact?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-meta font-medium text-secondary">Kind</legend>
      <div className="grid grid-cols-5 gap-0.5 rounded-control bg-surface-2 p-0.5">
        {PLACE_KINDS.map((k) => {
          const I = KIND_ICONS[k];
          return (
            <label key={k} className="cursor-pointer" title={KIND_META[k].hint}>
              <input
                type="radio"
                name="kind"
                value={k}
                defaultChecked={k === defaultValue}
                required
                className="peer sr-only"
              />
              <span className={`${SEGMENT} [&>svg]:peer-checked:text-primary`}>
                <I size={16} strokeWidth={1.75} aria-hidden />
                {KIND_META[k].label}
              </span>
            </label>
          );
        })}
      </div>
      {!compact && <p className="mt-1.5 text-meta text-muted">Home and Family both count as home for trips.</p>}
    </fieldset>
  );
}

export function SizePicker({ defaultValue, compact }: { defaultValue?: number | null; compact?: boolean }) {
  const value = defaultValue ?? PLACE_SIZES[0].radius;
  const custom = !PLACE_SIZES.some((s) => s.radius === value);
  return (
    <fieldset>
      <legend className="mb-1.5 text-meta font-medium text-secondary">Size</legend>
      <div className={`grid gap-0.5 rounded-control bg-surface-2 p-0.5 ${custom ? "grid-cols-5" : "grid-cols-4"}`}>
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
              <span className="text-label font-semibold leading-none">{s.label}</span>
              <span className="tabular-nums">{formatRadius(s.radius)}</span>
            </span>
          </label>
        ))}
        {custom && (
          <label className="cursor-pointer" title="Set elsewhere">
            <input type="radio" name="radius" value={value} defaultChecked className="peer sr-only" />
            <span className={SEGMENT}>
              <span className="text-label font-semibold leading-none">Own</span>
              <span className="tabular-nums">{formatRadius(value)}</span>
            </span>
          </label>
        )}
      </div>
      {!compact && (
        <p className="mt-1.5 text-meta text-muted">Stays anywhere within it count as this place; a campus needs L.</p>
      )}
    </fieldset>
  );
}

/**
 * "Home" badge (with the kind's icon) for a saved place: neutral, since a
 * kind is a label, not a selection. The size is shown where it matters (the
 * place page's map), not in every row.
 */
export function KindBadge({ kind, radius }: { kind: PlaceKind; radius?: number | null }) {
  return (
    <Badge tone="neutral" icon={KIND_ICONS[kind]}>
      {KIND_META[kind].label}
      {radius ? <span className="text-muted">· {formatRadius(radius)}</span> : null}
    </Badge>
  );
}
