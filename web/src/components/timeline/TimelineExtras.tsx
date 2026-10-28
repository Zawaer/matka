"use client";

// Parts of the timeline list beyond visits and trips: "Visited X?" (pick the
// right name for a guessed place), "Missing travel" (add a trip where none
// was recorded), and the photos taken during a visit or trip with a simple
// viewer.

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { categoryLabel } from "@/components/places/category";
import type { DayPhotosAnswer } from "@/lib/dayPhotos";
import { formatDistance, formatDuration, formatTime } from "@/lib/format";
import type { PlaceCandidate } from "@/lib/placeConfirm";
import type { Visit } from "@/lib/types";
import type { MissingTravel } from "./gaps";

const refreshDay = (mutate: ReturnType<typeof useSWRConfig>["mutate"]) =>
  mutate((k) => typeof k === "string" && /^\/api\/(timeline|day-summary)/.test(k));

/* ---------------- "Visited X?" ---------------- */

/** "school", "library", "address": what a candidate is. */
export const candidateType = (c: PlaceCandidate) => (c.address ? "address" : c.category ? categoryLabel(c.category).toLowerCase() : "place");

/**
 * Under a visit whose name is a guess: "Yes · Pick another". Yes keeps the
 * name; Pick another lists the nearby candidates and "Other name…". The
 * answer goes to the place, so every visit there changes with it.
 */
export function PlaceQuestion({ visit, shownName }: { visit: Visit; shownName: string }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = (visit.candidates ?? []).filter((c) => c.name.toLowerCase() !== shownName.toLowerCase());

  async function answer(body: { confirm: true } | { name: string; category?: string | null }) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/places/${visit.placeId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Server answered ${r.status}`);
      await refreshDay(mutate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const chip =
    "rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary/60 hover:text-text disabled:opacity-50";
  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chip} disabled={busy} onClick={() => answer({ confirm: true })}>
          Yes
        </button>
        <button
          type="button"
          className={`${chip} ${open ? "border-primary/60 text-text" : ""}`}
          disabled={busy}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          Pick another
        </button>
      </div>
      {open && (
        <ul className="mt-2 overflow-hidden rounded-xl border border-border">
          {others.map((c) => (
            <li key={c.name} className="border-b border-border last:border-b-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => answer({ name: c.name, category: c.category })}
                className="flex w-full items-baseline gap-1.5 px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="min-w-0 truncate text-text">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">· {candidateType(c)}</span>
              </button>
            </li>
          ))}
          <li>
            {typing ? (
              <form
                className="flex items-center gap-2 px-2 py-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim()) void answer({ name: name.trim() });
                }}
              >
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="Name of this place"
                  aria-label="Name of this place"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setTyping(true)}
                className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-text"
              >
                Other name…
              </button>
            )}
          </li>
        </ul>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-accent" role="alert">
          Couldn&apos;t save: {error}
        </p>
      )}
    </div>
  );
}

/* ---------------- Missing travel ---------------- */

/** "Missing travel · 9.5 km · 17 min" between two rows that are far apart, with "Add travel". */
export function MissingTravelRow({ gap, onAdd }: { gap: MissingTravel; onAdd: () => void }) {
  const noData = gap.secs >= 30 * 60;
  return (
    <li className="flex gap-3 sm:gap-4">
      <div className="relative flex w-10 shrink-0 flex-col items-center">
        <span
          className="w-px flex-1"
          style={{
            backgroundImage: "linear-gradient(var(--mk-accent) 40%, transparent 0%)",
            backgroundSize: "1px 7px",
            backgroundRepeat: "repeat-y",
            opacity: 0.7,
          }}
        />
      </div>
      <div className="my-1 flex flex-1 items-center gap-3 rounded-xl border border-dashed border-accent/50 px-3 py-2">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-accent">Missing travel</p>
          <p className="text-muted">
            {formatDistance(gap.distance)}
            {gap.secs >= 60 ? ` · ${formatDuration(gap.secs)}` : ""}
          </p>
          <p className="text-xs text-muted">
            {noData ? "No location recorded" : "No trip recorded"} ·{" "}
            <span className="whitespace-nowrap">
              {formatTime(gap.from)} – {formatTime(gap.to)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs font-semibold text-text hover:border-primary/60 hover:text-primary"
        >
          Add travel
        </button>
      </div>
    </li>
  );
}

/* ---------------- Photos ---------------- */

const thumb = (id: string, size: "thumbnail" | "preview" = "thumbnail") =>
  `/api/immich/asset/${encodeURIComponent(id)}?size=${size}`;

const photosFetcher = (url: string): Promise<DayPhotosAnswer> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

/**
 * The day's photos, after the timeline itself has loaded (`ready`); asks
 * again while the server is still looking them up.
 */
export function useDayPhotos(date: string | null, ready: boolean) {
  const { data } = useSWR<DayPhotosAnswer>(ready && date ? `/api/timeline/photos?date=${date}` : null, photosFetcher, {
    revalidateOnFocus: false,
    refreshInterval: (d) => (d?.pending ? 3000 : 0),
  });
  return data?.configured ? data : null;
}

/** How many thumbnails a row shows before "+N". */
const STRIP = 6;

export type PhotoSet = { ids: string[]; total: number };

/** A row of up to STRIP thumbnails; a tap opens the viewer, "+N" opens it at the rest. */
export function PhotoStrip({ set, onOpen }: { set: PhotoSet; onOpen: (index: number) => void }) {
  const shown = set.ids.slice(0, STRIP);
  const more = set.total - shown.length;
  return (
    <div className="mt-2.5 grid max-w-sm grid-cols-6 gap-1.5">
      {shown.map((id, i) => {
        const last = i === shown.length - 1 && more > 0;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onOpen(i)}
            aria-label={last ? `${more} more photos` : `Photo ${i + 1}`}
            className="relative aspect-square overflow-hidden rounded-lg bg-surface-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Immich proxy, sized by CSS */}
            <img src={thumb(id)} alt="" loading="lazy" className="h-full w-full object-cover" />
            {last && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">
                +{more}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Full-screen viewer for one item's photos: arrows/swipe-free buttons, Esc closes, a link to Immich when set up. */
export function PhotoViewer({
  ids,
  total,
  start,
  linkBase,
  onClose,
}: {
  ids: string[];
  total: number;
  start: number;
  linkBase: string | null;
  onClose: () => void;
}) {
  const [i, setI] = useState(Math.min(start, ids.length - 1));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((x) => Math.min(ids.length - 1, x + 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids.length, onClose]);
  const id = ids[i];
  const nav = "flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 disabled:opacity-30";
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0, 0, 0, 0.94)" }} role="dialog" aria-modal="true" aria-label="Photos" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <span className="tabular-nums">
          {i + 1} / {ids.length}
          {total > ids.length ? ` (of ${total})` : ""}
        </span>
        <span className="flex-1" />
        {linkBase && (
          <a
            href={`${linkBase}/photos/${encodeURIComponent(id)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
          >
            Open in Immich ↗
          </a>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className={nav}>
          ×
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Immich proxy */}
        <img key={id} src={thumb(id, "preview")} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
          <button type="button" className={`${nav} pointer-events-auto`} disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous photo">
            ‹
          </button>
          <button
            type="button"
            className={`${nav} pointer-events-auto`}
            disabled={i >= ids.length - 1}
            onClick={() => setI(i + 1)}
            aria-label="Next photo"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
