"use client";

// Parts of the timeline list beyond visits and trips: "Visited X?" (pick the
// right name for a guessed place), "Missing travel" (add a trip where none
// was recorded), and the photos taken during a visit or trip with a simple
// viewer.

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Plus, Route, X } from "lucide-react";
import { Button, Input, cx } from "@/components/ui";
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

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-meta text-muted">Right place?</span>
        <Button size="sm" icon={Check} disabled={busy} onClick={() => answer({ confirm: true })} className="h-7">
          Yes
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconRight={ChevronDown}
          disabled={busy}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cx("h-7", open && "bg-surface-2 text-text")}
        >
          Pick another
        </Button>
      </div>
      {open && (
        <ul className="mt-2 overflow-hidden rounded-control border border-border">
          {others.map((c) => (
            <li key={c.name} className="border-b border-border last:border-b-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => answer({ name: c.name, category: c.category })}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="min-w-0 truncate text-text">{c.name}</span>
                <span className="shrink-0 text-meta text-muted">{candidateType(c)}</span>
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
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="Name of this place"
                  aria-label="Name of this place"
                  className="h-8 flex-1"
                />
                <Button type="submit" size="sm" variant="primary" disabled={busy || !name.trim()}>
                  Save
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setTyping(true)}
                className="w-full px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                Other name…
              </button>
            )}
          </li>
        </ul>
      )}
      {error && (
        <p className="mt-1.5 text-meta text-danger" role="alert">
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
            backgroundImage: "linear-gradient(var(--mk-warn) 40%, transparent 0%)",
            backgroundSize: "1px 7px",
            backgroundRepeat: "repeat-y",
            opacity: 0.8,
          }}
        />
      </div>
      <div className="my-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-card border border-dashed border-warn/45 bg-warn/5 px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warn/12 text-warn" aria-hidden>
          <Route size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-text">
            Missing travel
            <span className="font-normal tabular-nums text-muted">
              {" "}
              · {formatDistance(gap.distance)}
              {gap.secs >= 60 ? ` · ${formatDuration(gap.secs)}` : ""}
            </span>
          </p>
          <p className="mt-0.5 text-meta text-muted">
            {noData ? "No location recorded" : "No trip recorded"} ·{" "}
            <span className="whitespace-nowrap tabular-nums">
              {formatTime(gap.from)} – {formatTime(gap.to)}
            </span>
          </p>
        </div>
        <Button size="sm" icon={Plus} onClick={onAdd}>
          Add travel
        </Button>
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
            className="relative aspect-square overflow-hidden rounded-md bg-surface-2 transition-opacity hover:opacity-90"
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
  const nav =
    "flex h-10 w-10 items-center justify-center rounded-control bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30";
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
            className="inline-flex h-10 items-center gap-1.5 rounded-control bg-white/10 px-3 text-meta font-medium text-white transition-colors hover:bg-white/20"
          >
            Open in Immich
            <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
          </a>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className={nav}>
          <X size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Immich proxy */}
        <img key={id} src={thumb(id, "preview")} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
          <button type="button" className={`${nav} pointer-events-auto`} disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous photo">
            <ChevronLeft size={24} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            className={`${nav} pointer-events-auto`}
            disabled={i >= ids.length - 1}
            onClick={() => setI(i + 1)}
            aria-label="Next photo"
          >
            <ChevronRight size={24} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
