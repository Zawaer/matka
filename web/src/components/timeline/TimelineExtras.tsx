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
 * The name to show for a guessed visit, and the other candidates for the
 * meta line: "Café Maiasmokk?" / "Or: Kehrwieder · Pikk 16". When the place
 * has no name of its own, the top candidate is the guess.
 */
export function questionGuess(visit: Visit): { name: string; others: string[]; fromCandidates: boolean } | null {
  const cands = visit.candidates ?? [];
  if (!cands.length) return null;
  const own = visit.placeName && visit.placeName !== "Unknown Location" ? visit.placeName : null;
  const name = own ?? cands[0].name;
  const others = cands.filter((c) => c.name.toLowerCase() !== name.toLowerCase()).slice(0, 2).map((c) => c.name);
  return { name, others, fromCandidates: !own };
}

/**
 * Under a visit whose name is a guess: [Yes] [Something else ▾], aligned with
 * the title. Yes keeps the guess; Something else lists the nearby candidates
 * and "Other name…". The answer goes to the place, so every visit there
 * changes with it.
 */
export function PlaceQuestion({ visit, shownName }: { visit: Visit; shownName: string }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cands = visit.candidates ?? [];
  const others = cands.filter((c) => c.name.toLowerCase() !== shownName.toLowerCase());
  const guess = questionGuess(visit);

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

  const yes = () => {
    // A guess taken from the candidates is a pick; the place's own name is a confirmation.
    const top = cands.find((c) => c.name === shownName);
    if (guess?.fromCandidates && top) void answer({ name: top.name, category: top.category });
    else void answer({ confirm: true });
  };

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="tonal" icon={Check} disabled={busy} onClick={yes} aria-label={`Yes, it was ${shownName}`}>
          Yes
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconRight={ChevronDown}
          disabled={busy}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cx(open && "bg-surface-2 text-text")}
        >
          Something else
        </Button>
      </div>
      {open && (
        <ul className="mt-2 overflow-hidden rounded-control border border-border bg-surface">
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

/**
 * "Missing travel · 9.5 km · 17 min" between two rows that are far apart,
 * with "Add travel": stacked on phones (title, meta, button), one row from sm.
 */
export function MissingTravelRow({ gap, onAdd }: { gap: MissingTravel; onAdd: () => void }) {
  const noData = gap.secs >= 30 * 60;
  return (
    <li className="flex gap-2 sm:gap-3">
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
      {/* Laid out by its own width: the button goes under the text in a
          narrow column (phones, the 480 px split list), beside it from 560 px. */}
      <div className="@container mb-1 min-w-0 flex-1 rounded-card border border-warn/30 bg-warn/5 px-3 py-2.5">
        <div className="flex flex-col gap-2.5 @[35rem]:flex-row @[35rem]:items-center @[35rem]:gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-label text-text">
              <Route size={16} strokeWidth={1.75} aria-hidden className="mr-1.5 inline-block align-[-3px] text-warn" />
              Missing travel{" "}
              <span className="font-normal tabular-nums text-muted">
                · <span className="whitespace-nowrap">{formatDistance(gap.distance)}</span>
                {gap.secs >= 60 ? (
                  <>
                    {" "}
                    · <span className="whitespace-nowrap">{formatDuration(gap.secs)}</span>
                  </>
                ) : null}
              </span>
            </p>
            <p className="mt-0.5 text-meta text-muted">
              {noData ? "No location recorded" : "No trip recorded"} ·{" "}
              <span className="whitespace-nowrap tabular-nums">
                {formatTime(gap.from)} – {formatTime(gap.to)}
              </span>
            </p>
          </div>
          <Button size="sm" icon={Plus} onClick={onAdd} className="self-start @[35rem]:self-center">
            Add travel
          </Button>
        </div>
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

/**
 * Full-screen viewer for one item's photos: a caption with the time and
 * place, arrows (hidden at the ends), a thumbnail rail on desktop, Esc
 * closes, and a link to Immich when set up.
 */
export function PhotoViewer({
  ids,
  total,
  start,
  caption,
  linkBase,
  onClose,
}: {
  ids: string[];
  total: number;
  start: number;
  /** "12:40 · Kotikatu 12". */
  caption?: string;
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
    "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Photos" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="font-medium tabular-nums">
            {i + 1} of {Math.max(total, ids.length)}
          </p>
          {caption && <p className="truncate text-meta text-white/70">{caption}</p>}
        </div>
        <span className="flex-1" />
        {linkBase && (
          <a
            href={`${linkBase}/photos/${encodeURIComponent(id)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-control bg-white/12 px-3 text-meta font-medium text-white transition-colors hover:bg-white/24"
          >
            Open in Immich
            <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-control bg-white/12 text-white transition-colors hover:bg-white/24"
        >
          <X size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Immich proxy */}
        <img key={id} src={thumb(id, "preview")} alt="" className="h-full w-full object-contain" />
        <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
          {i > 0 ? (
            <button type="button" className={nav} onClick={() => setI(i - 1)} aria-label="Previous photo">
              <ChevronLeft size={24} strokeWidth={1.75} aria-hidden />
            </button>
          ) : (
            <span />
          )}
          {i < ids.length - 1 && (
            <button type="button" className={nav} onClick={() => setI(i + 1)} aria-label="Next photo">
              <ChevronRight size={24} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {ids.length > 1 && (
        <div className="hidden justify-center gap-1.5 px-4 pb-4 sm:flex" onClick={(e) => e.stopPropagation()}>
          {ids.map((pid, j) => (
            <button
              key={pid}
              type="button"
              onClick={() => setI(j)}
              aria-label={`Photo ${j + 1}`}
              aria-current={j === i ? "true" : undefined}
              className={cx(
                "h-12 w-12 overflow-hidden rounded-md transition-opacity",
                j === i ? "opacity-100 ring-2 ring-white" : "opacity-50 hover:opacity-80",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Immich proxy */}
              <img src={thumb(pid)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
