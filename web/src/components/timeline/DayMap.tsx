"use client";

// The selected day on a map, above the timeline list (and alone in the
// phone app's /embed/day): the day's trips as lines in their mode colours
// and its stops as markers with their category icon and order number, trips
// the user added as dashed straight lines, and the day's photos as small
// thumbnails (clustered when dense). One MapLibre instance lives for as long
// as the component does; switching days swaps its data.

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Maximize } from "lucide-react";
import { PLACE_GROUP_ICONS } from "@/components/ui/icons";
import type { LngLatBoundsLike, Map as MlMap, Marker } from "maplibre-gl";
import { computeDark, modeColorExpression, resolveColor, fitPadding, loadStyle, tameBasemap } from "@/components/map/mapStyle";
import type { TimelineDay } from "@/lib/types";
import type { PhotoPoint } from "@/lib/dayPhotos";
import { PLACE_ICONS } from "@/lib/placeIcons";
import { bboxOf, clusterLabel, clusterPoints, dayStops, dayTracks, dayWindow, nextStopKey, stopLabel, type Stop } from "./dayMap";

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
  if (m.getLayer("day-added")) {
    m.setPaintProperty("day-added", "line-width", (sel ? ["case", is, LINE_W_SEL - 1, LINE_W - 1] : LINE_W - 1) as never);
    m.setPaintProperty("day-added", "line-opacity", (sel ? ["case", is, 1, 0.45] : 0.95) as never);
  }
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
  const added = ["==", ["get", "added"], true] as never;
  m.addLayer({
    id: "day-routes",
    type: "line",
    source: "day-tracks",
    layout,
    filter: ["!", added] as never,
    paint: { "line-color": modeColorExpression() as never, "line-width": LINE_W, "line-opacity": 0.95 },
  });
  // Trips the user added where nothing was recorded: dashed, as a guess.
  m.addLayer({
    id: "day-added",
    type: "line",
    source: "day-tracks",
    layout: { "line-cap": "butt", "line-join": "round" },
    filter: added,
    paint: {
      "line-color": modeColorExpression() as never,
      "line-width": LINE_W - 1,
      "line-opacity": 0.95,
      "line-dasharray": [2, 1.5],
    },
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

// Stops are neutral (ink on surface); only the selected one takes the accent.
// 28 px, so a stop covers less of the city label it sits on.
const MARKER_CLASS =
  "group relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-secondary bg-surface text-secondary shadow-md transition-[scale] hover:border-text hover:text-text data-[sel=true]:scale-115 data-[sel=true]:border-primary data-[sel=true]:bg-primary data-[sel=true]:text-on-primary";
/** The stop's order number(s), as on the timeline's rows; pushed outward, off the glyph. */
const BADGE_CLASS =
  "pointer-events-none absolute -right-3 -top-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-surface bg-text px-1 text-caption font-semibold leading-none tabular-nums text-bg group-data-[sel=true]:bg-primary group-data-[sel=true]:text-on-primary";
const LABEL_CLASS =
  "pointer-events-none absolute left-full top-1/2 ml-1.5 hidden data-[flip=true]:left-auto data-[flip=true]:right-full data-[flip=true]:ml-0 data-[flip=true]:mr-1.5 max-w-44 -translate-y-1/2 truncate rounded-md border border-border bg-surface px-2 py-0.5 text-caption font-medium text-text shadow-md group-hover:block group-data-[sel=true]:block";

/**
 * A stop's marker: MapLibre positions the outer element with `transform`, so
 * the look (and the scale-up when selected) lives on the inner button.
 */
function markerElement(stop: Stop, cluster = false): { root: HTMLElement; button: HTMLElement; glyph: Root } {
  const root = document.createElement("div");
  const el = document.createElement("button");
  el.type = "button";
  el.className = MARKER_CLASS;
  const icon = PLACE_ICONS[stop.icon];
  el.setAttribute(
    "aria-label",
    cluster ? `Stops ${clusterLabel(stop.numbers)}: zoom in` : `${stop.numbers.join(", ")}. ${stop.name} (${icon.label})`,
  );
  const glyph = document.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  glyph.className = "flex";
  // The category's Lucide icon, drawn by a tiny React root of its own.
  const glyphRoot = createRoot(glyph);
  const G = PLACE_GROUP_ICONS[stop.icon];
  glyphRoot.render(<G size={16} strokeWidth={1.75} aria-hidden />);
  el.appendChild(glyph);
  const badge = document.createElement("span");
  badge.className = BADGE_CLASS;
  badge.textContent = cluster ? clusterLabel(stop.numbers) : stopLabel(stop.numbers);
  el.appendChild(badge);
  const label = document.createElement("span");
  label.className = LABEL_CLASS;
  label.textContent = stop.name;
  el.appendChild(label);
  root.appendChild(el);
  return { root, button: el, glyph: glyphRoot };
}

/** Stop markers closer than this (px) are drawn as one marker: "1–4", zoom in on click. */
const STOP_CELL = 36;

/** Unmounts a marker's icon root after the current render (React can't unmount mid-commit). */
const dropGlyph = (r: Root) => setTimeout(() => r.unmount(), 0);

/**
 * Fills the selected stop's marker and lifts it above its neighbours; its
 * name goes on whichever side of it has more room.
 */
function markSelected(m: MlMap, markers: { marker: Marker; el: HTMLElement; stop: Stop; glyph: Root; members: Stop[] }[], key: string | null) {
  const w = m.getContainer().clientWidth;
  for (const mk of markers) {
    const on = key != null && mk.stop.keys.includes(key);
    mk.el.dataset.sel = String(on);
    mk.marker.getElement().style.zIndex = on ? "2" : "";
    const label = mk.el.lastElementChild as HTMLElement | null;
    if (label) label.dataset.flip = String(m.project([mk.stop.lon, mk.stop.lat]).x > w * 0.6);
  }
}

/* ---------------- Photos ---------------- */

const thumbUrl = (id: string) => `/api/immich/asset/${encodeURIComponent(id)}?size=thumbnail`;
/** Photo markers closer than this (px) are one marker with a count. */
const PHOTO_CELL = 38;
/** Up and to the right of where it was taken, so a photo at a stop peeks out beside its marker. */
const PHOTO_OFFSET: [number, number] = [18, -20];

/** A photo marker: a small rounded thumbnail, with a count when it stands for several. */
function photoElement(p: PhotoPoint, count: number): HTMLElement {
  const root = document.createElement("div");
  const el = document.createElement("button");
  el.type = "button";
  el.className =
    "relative block h-8 w-8 cursor-pointer rounded-lg border-2 border-white bg-surface-2 bg-cover bg-center shadow-md transition-[scale] hover:scale-110 dark:border-surface";
  el.style.backgroundImage = `url("${thumbUrl(p.id)}")`;
  el.setAttribute("aria-label", count > 1 ? `${count} photos` : "Photo");
  if (count > 1) {
    const badge = document.createElement("span");
    badge.className =
      "pointer-events-none absolute -bottom-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-text px-1 text-caption font-bold leading-none tabular-nums text-bg";
    badge.textContent = String(count);
    el.appendChild(badge);
  }
  root.appendChild(el);
  return root;
}

function padding(m: MlMap) {
  const el = m.getContainer();
  const w = el.clientWidth;
  // Clear of the zoom / full-screen buttons (top-right, desktop) and the
  // attribution; markers stick out ~14 px past their point.
  return w < 640
    ? fitPadding(w, el.clientHeight, { top: 40, right: 32, bottom: 32, left: 28 })
    : fitPadding(w, el.clientHeight, { top: 56, right: 80, bottom: 48, left: 40 });
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
  photos,
  fill = false,
  split = false,
}: {
  day: TimelineDay;
  /** The day's GPS-tagged photos (GET /api/timeline/photos), drawn as thumbnails. */
  photos?: PhotoPoint[];
  selected: DayMapSelection;
  /** A stop or a line was tapped on the map. */
  onSelect: (key: string) => void;
  /** Fill the parent (embed) instead of the card heights used on /timeline. */
  fill?: boolean;
  /** On /timeline: a card above the list, and the full-height right column of the split view from 1200 px. */
  split?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<{ marker: Marker; el: HTMLElement; stop: Stop; glyph: Root; members: Stop[] }[]>([]);
  const photoMarkersRef = useRef<Marker[]>([]);
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
      const style = await loadStyle(computeDark());
      if (cancelled) return;
      const m = new ml.Map({
        container,
        style: style as never,
        center: [25.5, 64.5],
        zoom: 4.3,
        attributionControl: { compact: false },
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
        tameBasemap(m);
        ensureLayers(m, shownRef.current?.tracks ?? EMPTY);
        paintSelection(m, selectedRef.current);
        setReady(true);
      });

      onTheme = () => {
        void loadStyle(computeDark()).then((st) => {
          if (cancelled) return;
          m.setStyle(st as never, { diff: false });
          m.once("styledata", () => {
            if (cancelled) return;
            tameBasemap(m);
            ensureLayers(m, shownRef.current?.tracks ?? EMPTY);
            paintSelection(m, selectedRef.current);
          });
        });
      };
      mql.addEventListener("change", onTheme);
    })();

    return () => {
      cancelled = true;
      if (onTheme) mql.removeEventListener("change", onTheme);
      for (const mk of markersRef.current) {
        mk.marker.remove();
        dropGlyph(mk.glyph);
      }
      markersRef.current = [];
      for (const mk of photoMarkersRef.current) mk.remove();
      photoMarkersRef.current = [];
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

    // Fit first, so the stops cluster at the zoom they'll be seen at.
    if (fittedRef.current !== shown.date) {
      fit(m, bboxOf(shown.tracks, shown.stops), fittedRef.current != null);
      fittedRef.current = shown.date;
    }
    const stops = shown.stops;
    const draw = () => {
      for (const mk of markersRef.current) {
        mk.marker.remove();
        dropGlyph(mk.glyph);
      }
      const xy = stops.map((st) => m.project([st.lon, st.lat]));
      markersRef.current = clusterPoints(xy, STOP_CELL).map((group) => {
        const members = group.map((i) => stops[i]);
        const cluster = members.length > 1;
        const stop: Stop = cluster
          ? { ...members[0], numbers: members.flatMap((x) => x.numbers), keys: members.flatMap((x) => x.keys) }
          : members[0];
        const { root, button, glyph } = markerElement(stop, cluster);
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          if (cluster) {
            const b = bboxOf(EMPTY, members);
            if (b) m.fitBounds(b as LngLatBoundsLike, { padding: padding(m), maxZoom: 18, duration: 500 });
          } else onSelectRef.current(nextStopKey(stop, selectedRef.current));
        });
        const marker = new ml.Marker({ element: root, anchor: "center" }).setLngLat([stop.lon, stop.lat]).addTo(m);
        return { marker, el: button, stop, glyph, members };
      });
      markSelected(m, markersRef.current, selectedRef.current);
    };
    draw();
    m.on("zoomend", draw);
    return () => {
      m.off("zoomend", draw);
    };
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
      const stop = shownRef.current?.stops.find((st) => st.keys.includes(selKey));
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

  // Photo thumbnails, re-clustered whenever the zoom changes. Only the shown
  // day's: a day switch clears them until its photos arrive.
  const photoKey = photos ? photos.map((p) => p.id).join(",") : "";
  useEffect(() => {
    const m = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !m || !ml) return;
    const pts = (photos ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    const draw = () => {
      for (const mk of photoMarkersRef.current) mk.remove();
      photoMarkersRef.current = [];
      if (!pts.length) return;
      const xy = pts.map((p) => m.project([p.lon, p.lat]));
      for (const group of clusterPoints(xy, PHOTO_CELL)) {
        const first = pts[group[0]];
        const root = photoElement(first, group.length);
        root.firstElementChild?.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current(first.key);
        });
        photoMarkersRef.current.push(new ml.Marker({ element: root, anchor: "center", offset: PHOTO_OFFSET }).setLngLat([first.lon, first.lat]).addTo(m));
        // Below the stops (right after the canvas): a stop stays clickable where a photo sits on it.
        const canvas = m.getCanvas();
        canvas.parentElement?.insertBefore(root, canvas.nextSibling);
      }
    };
    draw();
    m.on("zoomend", draw);
    return () => {
      m.off("zoomend", draw);
      for (const mk of photoMarkersRef.current) mk.remove();
      photoMarkersRef.current = [];
    };
    // photoKey stands for `photos`: a refetch with the same photos leaves the markers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, photoKey]);

  const loading = !ready || shown?.date !== day.date;

  return (
    <div
      className={
        fill
          ? "relative h-full w-full overflow-hidden"
          : `relative h-[260px] w-full overflow-hidden rounded-card border border-border bg-surface-2 shadow-card md:h-[340px] ${
              split ? "split:h-full split:rounded-none split:border-0" : ""
            }`
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
          className="mk-map-btn absolute right-2.5 top-2.5 sm:top-[84px]"
        >
          <Maximize size={16} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
      {ready && loading ? (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-surface-2/40" aria-hidden />
      ) : null}
    </div>
  );
}
