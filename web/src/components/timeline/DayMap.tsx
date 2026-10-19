"use client";

// The selected day on a map, above the timeline list (and alone in the
// phone app's /embed/day): the day's trips as lines in their mode colours
// and its stops as numbered markers. One MapLibre instance lives for as long
// as the component does; switching days swaps its data.

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { LngLatBoundsLike, Map as MlMap, Marker } from "maplibre-gl";
import { computeDark, modeColorExpression, resolveColor, styleUrl } from "@/components/map/mapStyle";
import type { TimelineDay } from "@/lib/types";
import { bboxOf, dayStops, dayTracks, dayWindow, nextStopKey, stopLabel, type Stop } from "./dayMap";

type FC = GeoJSON.FeatureCollection;
type BBox = [number, number, number, number];

/** What's selected, and where: a pick in the list pans the map, a tap on the map doesn't. */
export type DayMapSelection = { key: string; from: "list" | "map" } | null;

type Shown = { date: string; tracks: FC; stops: Stop[] };

const EMPTY: FC = { type: "FeatureCollection", features: [] };

/* ---------------- Tracks, one request per day ---------------- */

// Past days don't change (much): keep their lines for the session. Today
// goes to the server every time, which answers 304 while nothing is new.
const trackCache = new Map<string, FC>();
const CACHE_DAYS = 40;

async function loadTracks(win: { from: number; to: number }, signal: AbortSignal): Promise<FC> {
  const k = `${win.from}-${win.to}`;
  const hit = trackCache.get(k);
  if (hit) return hit;
  const res = await fetch(`/api/tracks/geojson?from=${win.from}&to=${win.to}`, { cache: "no-cache", signal });
  if (!res.ok) throw new Error(`tracks ${res.status}`);
  const fc = (await res.json()) as FC;
  if (win.to * 1000 < Date.now() - 60 * 60 * 1000) {
    trackCache.set(k, fc);
    while (trackCache.size > CACHE_DAYS) trackCache.delete(trackCache.keys().next().value!);
  }
  return fc;
}

/* ---------------- Map styling ---------------- */

const LINE_W = 4;
const LINE_W_SEL = 7;

/** Line paint for the current selection: the picked trip thick and on top, the rest faded. */
function paintSelection(m: MlMap, key: string | null) {
  if (!m.getLayer("day-routes")) return;
  const sel = key?.startsWith("m-") ? key : null;
  const is = ["==", ["get", "key"], sel ?? ""];
  m.setPaintProperty("day-routes", "line-width", (sel ? ["case", is, LINE_W_SEL, LINE_W] : LINE_W) as never);
  m.setPaintProperty("day-routes", "line-opacity", (sel ? ["case", is, 1, 0.45] : 0.95) as never);
  m.setPaintProperty("day-casing", "line-width", (sel ? ["case", is, LINE_W_SEL + 4, LINE_W + 3] : LINE_W + 3) as never);
  m.setPaintProperty("day-casing", "line-opacity", (sel ? ["case", is, 1, 0.5] : 0.9) as never);
  m.setLayoutProperty("day-routes", "line-sort-key", (sel ? ["case", is, 1, 0] : 0) as never);
  m.setLayoutProperty("day-casing", "line-sort-key", (sel ? ["case", is, 1, 0] : 0) as never);
}

/** Adds (after a style swap: re-adds) the route layers, idempotently. */
function ensureLayers(m: MlMap, tracks: FC) {
  if (m.getSource("day-tracks")) return;
  m.addSource("day-tracks", { type: "geojson", data: tracks });
  const layout = { "line-cap": "round", "line-join": "round" } as const;
  // A casing in the page's surface colour keeps every mode readable on both basemaps.
  m.addLayer({
    id: "day-casing",
    type: "line",
    source: "day-tracks",
    layout,
    paint: { "line-color": resolveColor("var(--mk-surface)"), "line-width": LINE_W + 3, "line-opacity": 0.9 },
  });
  m.addLayer({
    id: "day-routes",
    type: "line",
    source: "day-tracks",
    layout,
    paint: { "line-color": modeColorExpression() as never, "line-width": LINE_W, "line-opacity": 0.95 },
  });
  // Wide and invisible, so a finger can hit a 4 px line.
  m.addLayer({
    id: "day-hit",
    type: "line",
    source: "day-tracks",
    layout,
    paint: { "line-color": "#000", "line-width": 22, "line-opacity": 0 },
  });
}

const MARKER_CLASS =
  "group relative flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-full border-2 border-primary bg-surface px-1.5 text-xs font-bold tabular-nums text-primary shadow-md transition-[scale] data-[sel=true]:scale-115 data-[sel=true]:bg-primary data-[sel=true]:text-surface";
const LABEL_CLASS =
  "pointer-events-none absolute left-full top-1/2 ml-1.5 hidden data-[flip=true]:left-auto data-[flip=true]:right-full data-[flip=true]:ml-0 data-[flip=true]:mr-1.5 max-w-44 -translate-y-1/2 truncate rounded-lg border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text shadow-md group-hover:block group-data-[sel=true]:block";

/**
 * A stop's marker: MapLibre positions the outer element with `transform`, so
 * the look (and the scale-up when selected) lives on the inner button.
 */
function markerElement(stop: Stop): { root: HTMLElement; button: HTMLElement } {
  const root = document.createElement("div");
  const el = document.createElement("button");
  el.type = "button";
  el.className = MARKER_CLASS;
  el.setAttribute("aria-label", `${stop.numbers.join(", ")}. ${stop.name}`);
  el.textContent = stopLabel(stop.numbers);
  const label = document.createElement("span");
  label.className = LABEL_CLASS;
  label.textContent = stop.name;
  el.appendChild(label);
  root.appendChild(el);
  return { root, button: el };
}

/**
 * Fills the selected stop's marker and lifts it above its neighbours; its
 * name goes on whichever side of it has more room.
 */
function markSelected(m: MlMap, markers: { marker: Marker; el: HTMLElement; stop: Stop }[], key: string | null) {
  const w = m.getContainer().clientWidth;
  for (const mk of markers) {
    const on = key != null && mk.stop.keys.includes(key);
    mk.el.dataset.sel = String(on);
    mk.marker.getElement().style.zIndex = on ? "2" : "";
    const label = mk.el.lastElementChild as HTMLElement | null;
    if (label) label.dataset.flip = String(m.project([mk.stop.lon, mk.stop.lat]).x > w * 0.6);
  }
}

function padding(m: MlMap) {
  const w = m.getContainer().clientWidth;
  const p = w < 500 ? 30 : 48;
  // Markers stick out ~14 px past their point; leave room for them at the top.
  return { top: p + 8, bottom: p, left: p, right: p };
}

function fit(m: MlMap, b: BBox | null, animate: boolean) {
  if (!b) return;
  if (b[0] === b[2] && b[1] === b[3]) {
    m.jumpTo({ center: [b[0], b[1]], zoom: 14 });
    return;
  }
  m.fitBounds(b as LngLatBoundsLike, { padding: padding(m), maxZoom: 16, duration: animate ? 500 : 0 });
}

/* ---------------- Component ---------------- */

export default function DayMap({
  day,
  selected,
  onSelect,
  fill = false,
}: {
  day: TimelineDay;
  selected: DayMapSelection;
  /** A stop or a line was tapped on the map. */
  onSelect: (key: string) => void;
  /** Fill the parent (embed) instead of the card heights used on /timeline. */
  fill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<{ marker: Marker; el: HTMLElement; stop: Stop }[]>([]);
  const shownRef = useRef<Shown | null>(null);
  const fittedRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
    selectedRef.current = selected?.key ?? null;
  });

  // One map for the component's life.
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    let onTheme: (() => void) | null = null;

    (async () => {
      const container = containerRef.current;
      if (!container) return;
      let ml: typeof import("maplibre-gl");
      try {
        ml = await import("maplibre-gl");
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled) return;
      ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      mlRef.current = ml;
      const m = new ml.Map({
        container,
        style: styleUrl(computeDark()),
        center: [25.5, 64.5],
        zoom: 4.3,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map = m;
      mapRef.current = m;
      m.touchZoomRotate.disableRotation();
      m.setMissingStyleImageResolver((id) => {
        if (!m.hasImage(id)) m.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      if (container.clientWidth >= 640) m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => console.warn("[DayMap] maplibre error", e?.error ?? e));

      m.on("click", "day-hit", (e) => {
        const key = e.features?.[0]?.properties?.key;
        if (typeof key === "string") onSelectRef.current(key);
      });
      m.on("mouseenter", "day-hit", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "day-hit", () => (m.getCanvas().style.cursor = ""));

      m.on("load", () => {
        if (cancelled) return;
        container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        ensureLayers(m, shownRef.current?.tracks ?? EMPTY);
        paintSelection(m, selectedRef.current);
        setReady(true);
      });

      onTheme = () => {
        m.setStyle(styleUrl(computeDark()));
        m.once("styledata", () => {
          if (cancelled) return;
          ensureLayers(m, shownRef.current?.tracks ?? EMPTY);
          paintSelection(m, selectedRef.current);
        });
      };
      mql.addEventListener("change", onTheme);
    })();

    return () => {
      cancelled = true;
      if (onTheme) mql.removeEventListener("change", onTheme);
      for (const mk of markersRef.current) mk.marker.remove();
      markersRef.current = [];
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // The day's data: stops straight from the timeline, lines from one tracks
  // request. A newer day aborts the older request, and a late answer is dropped.
  useEffect(() => {
    const ctrl = new AbortController();
    const items = day.items;
    const stops = dayStops(items);
    const win = dayWindow(day);
    const hasMoves = items.some((it) => it.kind === "move" && it.track.mode !== "stationary");
    const done = (fc: FC | null) => {
      if (ctrl.signal.aborted) return;
      setShown({ date: day.date, tracks: dayTracks(fc, items), stops });
    };
    if (!win || !hasMoves) {
      // Nothing to fetch; still answer asynchronously, like the fetch would.
      Promise.resolve(null).then(done);
    } else {
      loadTracks(win, ctrl.signal).then(done, (err) => {
        if (ctrl.signal.aborted) return;
        console.warn("[DayMap] couldn't load the day's lines", err);
        done(null); // the stops alone are still worth showing
      });
    }
    return () => ctrl.abort();
  }, [day]);

  // Draw the shown day once both it and the map are there.
  useEffect(() => {
    shownRef.current = shown;
    const m = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !m || !ml || !shown) return;
    ensureLayers(m, shown.tracks);
    (m.getSource("day-tracks") as { setData?: (d: FC) => void } | undefined)?.setData?.(shown.tracks);

    for (const mk of markersRef.current) mk.marker.remove();
    markersRef.current = shown.stops.map((stop) => {
      const { root, button } = markerElement(stop);
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(nextStopKey(stop, selectedRef.current));
      });
      const marker = new ml.Marker({ element: root, anchor: "center" }).setLngLat([stop.lon, stop.lat]).addTo(m);
      return { marker, el: button, stop };
    });

    // Fit once per day; a refetch of the same day leaves the view alone.
    if (fittedRef.current !== shown.date) {
      fit(m, bboxOf(shown.tracks, shown.stops), fittedRef.current != null);
      fittedRef.current = shown.date;
    }
  }, [shown, ready]);

  // Selection: thicken the line or fill the marker, and pan to it when it
  // was picked in the list.
  const selKey = selected?.key ?? null;
  const selFrom = selected?.from ?? null;
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    paintSelection(m, selKey);
    markSelected(m, markersRef.current, selKey);
    if (!selKey || selFrom !== "list") return;
    if (selKey.startsWith("v-")) {
      const stop = markersRef.current.find((mk) => mk.stop.keys.includes(selKey))?.stop;
      if (!stop) return;
      m.easeTo({ center: [stop.lon, stop.lat], zoom: Math.max(m.getZoom(), 14), duration: 600 });
      // Centred now: its name fits on the right again.
      const markers = markersRef.current;
      m.once("moveend", () => markSelected(m, markers, selKey));
    } else {
      const f = shownRef.current?.tracks.features.filter((x) => x.properties?.key === selKey) ?? [];
      const b = bboxOf({ type: "FeatureCollection", features: f });
      if (b) m.fitBounds(b as LngLatBoundsLike, { padding: padding(m), maxZoom: 16, duration: 600 });
    }
  }, [selKey, selFrom, ready, shown]);

  const loading = !ready || shown?.date !== day.date;

  return (
    <div
      className={
        fill
          ? "relative h-full w-full overflow-hidden"
          : "mk-card relative h-[260px] w-full overflow-hidden shadow-sm md:h-[340px]"
      }
    >
      <div ref={containerRef} className="h-full w-full" />
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Map unavailable</div>
      ) : null}
      {!ready && !failed ? <div className="absolute inset-0 animate-pulse bg-surface-2/60" aria-hidden /> : null}
      {ready && shown ? (
        <button
          type="button"
          aria-label="Show the whole day"
          title="Show the whole day"
          onClick={() => {
            const m = mapRef.current;
            if (m && shownRef.current) fit(m, bboxOf(shownRef.current.tracks, shownRef.current.stops), true);
          }}
          className="absolute left-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface/90 text-muted shadow-md backdrop-blur hover:text-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z" />
          </svg>
        </button>
      ) : null}
      {ready && loading ? (
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs text-muted shadow-md backdrop-blur">
          Loading…
        </div>
      ) : null}
    </div>
  );
}
