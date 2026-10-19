"use client";

// /embed/day: the day map alone, for the phone app's Timeline tab. The app
// talks to it through a tiny bridge instead of reloading the page:
//
//   app → page:  window.matkaDay.setDate("YYYY-MM-DD"), window.matkaDay.select(key | null)
//   page → app:  ReactNativeWebView.postMessage(JSON) with type "matka-day" and
//                event "ready" | "day" { date, hasMap } | "select" { key } |
//                "error" | "expired"
//
// Keys are the timeline's: "v-<visit id>" or "m-<trip id>".

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { TimelineDay } from "@/lib/types";
import { dayHasMap } from "./dayMap";
import type { DayMapSelection } from "./DayMap";

const DayMap = dynamic(() => import("./DayMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-2/60" aria-hidden />,
});

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

export function DayEmbed({ initialDate }: { initialDate: string | null }) {
  const [date, setDate] = useState<string | null>(initialDate);
  const [day, setDay] = useState<TimelineDay | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [sel, setSel] = useState<(DayMapSelection & { date: string }) | null>(null);
  const dayRef = useRef<TimelineDay | null>(null);

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
    post("ready");
    return () => {
      delete window.matkaDay;
    };
  }, []);

  // One timeline request per day; switching again drops the older one.
  useEffect(() => {
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

  const selected: DayMapSelection = sel && day && sel.date === day.date ? sel : null;
  const hasMap = !!day && dayHasMap(day.items);
  const [mapMounted, setMapMounted] = useState(false);
  if (hasMap && !mapMounted) setMapMounted(true);

  return (
    <div className="relative h-full w-full bg-surface">
      {/* Mounted from the first day with something to draw, so day changes reuse its map. */}
      {day && mapMounted ? (
        <div className={hasMap ? "h-full w-full" : "hidden"}>
          <DayMap
            day={day}
            fill
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
