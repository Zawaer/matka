"use client";

// /embed/day: the day map alone, for the phone app's Timeline tab. The app
// talks to it through a tiny bridge instead of reloading the page:
//
//   app → page:  window.matkaDay.setDate("YYYY-MM-DD"), window.matkaDay.select(key | null)
//   page → app:  ReactNativeWebView.postMessage(JSON) with type "matka-day" and
//                event "ready" { drawn: true } | "day" { date, hasMap } |
//                "drawn" { date } | "select" { key } | "error" | "expired"
//
// "drawn" comes once the day's lines and the basemap under them are on
// screen ("ready" says it will come; older pages never send it).
// Keys are the timeline's: "v-<visit id>" or "m-<trip id>".
//
// The page arrives with its first day (and the basemap style) inside, and
// DayMap with MapLibre is part of the page's own scripts, not a lazy chunk:
// everything the first map needs starts loading with the HTML
// (docs/redesign/daymap-perf.md).

import { useEffect, useRef, useState } from "react";
import type { TimelineDay } from "@/lib/types";
import type { DayPhotosAnswer, PhotoPoint } from "@/lib/dayPhotos";
import { dayHasMap } from "./dayMap";
import DayMap, { type DayMapSelection, type DayMapStart } from "./DayMap";

/** The first day as the server rendered it, with its lines and the basemap style when known. */
export type DayEmbedStart = DayMapStart & { day: TimelineDay };

export const DAY_MESSAGE = "matka-day";

type Bridge = { setDate: (date: string) => void; select: (key: string | null) => void };

declare global {
  interface Window {
    matkaDay?: Bridge;
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

function post(event: string, extra: Record<string, unknown> = {}) {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: DAY_MESSAGE, event, ...extra }));
  } catch {
    // Not in the app (a plain browser): nobody to tell.
  }
}

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function DayEmbed({ initialDate, start = null }: { initialDate: string | null; start?: DayEmbedStart | null }) {
  const [date, setDate] = useState<string | null>(start?.day.date ?? initialDate);
  const [day, setDay] = useState<TimelineDay | null>(start?.day ?? null);
  const [state, setState] = useState<"loading" | "ready" | "error">(start ? "ready" : "loading");
  const [sel, setSel] = useState<(DayMapSelection & { date: string }) | null>(null);
  const dayRef = useRef<TimelineDay | null>(start?.day ?? null);
  // The day that came with the page needs no request.
  const given = useRef<string | null>(start?.day.date ?? null);

  // The app's handle on the page.
  useEffect(() => {
    window.matkaDay = {
      setDate: (d) => {
        if (isDate(d)) setDate(d);
      },
      select: (key) => {
        const cur = dayRef.current;
        setSel(key && cur ? { key, from: "list", date: cur.date } : null);
      },
    };
    post("ready", { drawn: true });
    const first = dayRef.current;
    if (first && given.current === first.date) post("day", { date: first.date, hasMap: dayHasMap(first.items) });
    return () => {
      delete window.matkaDay;
    };
  }, []);

  // One timeline request per day; switching again drops the older one.
  useEffect(() => {
    if (date != null && date === given.current) return;
    given.current = null;
    const ctrl = new AbortController();
    fetch(date ? `/api/timeline?date=${date}` : "/api/timeline", { signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 401) {
          setState("error");
          post("expired");
          return;
        }
        if (!r.ok) throw new Error(`timeline ${r.status}`);
        const body = (await r.json()) as { day: TimelineDay };
        if (ctrl.signal.aborted) return;
        dayRef.current = body.day;
        setDay(body.day);
        setState("ready");
        post("day", { date: body.day.date, hasMap: dayHasMap(body.day.items) });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setState("error");
        post("error");
      });
    return () => ctrl.abort();
  }, [date]);

  // The day's photo thumbnails, after the day itself (asked again while the server looks them up).
  const [photos, setPhotos] = useState<{ date: string; points: PhotoPoint[] } | null>(null);
  const dayDate = day?.date ?? null;
  useEffect(() => {
    if (!dayDate) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (tries: number) =>
      fetch(`/api/timeline/photos?date=${dayDate}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<DayPhotosAnswer>) : null))
        .then((b) => {
          if (!b || ctrl.signal.aborted) return;
          setPhotos({ date: dayDate, points: b.points });
          if (b.pending && tries < 5) timer = setTimeout(() => load(tries + 1), 3000);
        })
        .catch(() => {});
    void load(0);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [dayDate]);

  const selected: DayMapSelection = sel && day && sel.date === day.date ? sel : null;
  const hasMap = !!day && dayHasMap(day.items);
  const [mapMounted, setMapMounted] = useState(() => !!start && dayHasMap(start.day.items));
  if (hasMap && !mapMounted) setMapMounted(true);

  return (
    <div className="relative h-full w-full bg-surface">
      {/* Mounted from the first day with something to draw, so day changes reuse its map. */}
      {day && mapMounted ? (
        <div className={hasMap ? "h-full w-full" : "hidden"}>
          <DayMap
            day={day}
            start={start}
            onDrawn={(d) => post("drawn", { date: d })}
            fill
            photos={photos && photos.date === day.date ? photos.points : undefined}
            selected={selected}
            onSelect={(key) => {
              setSel({ key, from: "map", date: day.date });
              post("select", { key });
            }}
          />
        </div>
      ) : null}
      {state === "error" ? (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
          Couldn&apos;t load this day.
        </p>
      ) : state === "ready" && !hasMap ? (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
          Nothing to show on the map for this day.
        </p>
      ) : null}
    </div>
  );
}
