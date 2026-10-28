"use client";

// A small, read-only map for pages about somewhere: a place (its pin and
// size circle), a trip (its routes and overnight stops), a city (its places)
// and the world (visited countries filled in, cities as dots sized by time).
// Uses the same basemap, colours and controls as the day map. Loaded lazily
// (components/map/LazyGeoMap.tsx), so MapLibre only downloads where a map is.

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import { computeDark, extendBounds, modeColorExpression, resolveColor, styleUrl, tameBasemap } from "./mapStyle";

type FC = GeoJSON.FeatureCollection;

export type GeoPoint = {
  lon: number;
  lat: number;
  /** Shown on hover / as the marker's accessible name. */
  label?: string;
  /** A number in the marker (trip stops). */
  num?: number;
  /** Relative size, 0–1 (world: time spent). */
  weight?: number;
  href?: string;
};

export type GeoMapProps = {
  /** Trip lines of a time window (epoch seconds), from /api/tracks/geojson. */
  window?: { from: number; to: number };
  points?: GeoPoint[];
  /** A saved place's catchment: a circle of `radius` metres. */
  circle?: { lon: number; lat: number; radius: number };
  /** Visited countries (names or ISO codes) to fill. */
  countries?: string[];
  /** Fit everything shown with this much padding (px). */
  padding?: number;
  /** Zoom used when there's only one point. */
  zoom?: number;
  /** Accessible description of what the map shows. */
  label: string;
  className?: string;
};

const EMPTY: FC = { type: "FeatureCollection", features: [] };

function circlePolygon(lon: number, lat: number, radius: number): GeoJSON.Feature {
  const pts: [number, number][] = [];
  const dLat = radius / 111_320;
  const dLon = radius / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}

let countriesCache: Promise<FC> | null = null;
const loadCountries = () =>
  (countriesCache ??= fetch("/geo/countries-110m.json").then((r) => {
    if (!r.ok) throw new Error(`countries ${r.status}`);
    return r.json() as Promise<FC>;
  }));

export default function GeoMap({ window: win, points = [], circle, countries, padding = 40, zoom = 14, label, className }: GeoMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  // The inputs as one key: the map is built once per distinct content.
  const key = JSON.stringify({ win, points, circle, countries });

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    const markers: { remove: () => void }[] = [];
    (async () => {
      const el = ref.current;
      if (!el) return;
      let ml: typeof import("maplibre-gl");
      try {
        ml = await import("maplibre-gl");
      } catch {
        if (!cancelled) setState("failed");
        return;
      }
      if (cancelled) return;
      ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      const dark = computeDark();
      const tracks = win
        ? fetch(`/api/tracks/geojson?from=${Math.floor(win.from)}&to=${Math.ceil(win.to)}`)
            .then((r) => (r.ok ? (r.json() as Promise<FC>) : EMPTY))
            .catch(() => EMPTY)
        : Promise.resolve(EMPTY);
      const world = countries ? loadCountries().catch(() => EMPTY) : Promise.resolve(EMPTY);

      const m = new ml.Map({
        container: el,
        style: styleUrl(dark),
        center: points[0] ? [points[0].lon, points[0].lat] : circle ? [circle.lon, circle.lat] : [20, 50],
        zoom: countries ? 1 : 4,
        attributionControl: { compact: false },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        scrollZoom: false,
        cooperativeGestures: false,
        renderWorldCopies: !countries,
      });
      map = m;
      m.touchZoomRotate.disableRotation();
      m.setMissingStyleImageResolver((id) => {
        if (!m.hasImage(id)) m.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => console.warn("[GeoMap] maplibre error", e?.error ?? e));

      m.on("load", async () => {
        if (cancelled) return;
        tameBasemap(m, dark);
        const [fc, countryFc] = await Promise.all([tracks, world]);
        if (cancelled) return;
        const primary = resolveColor("var(--mk-primary)");
        const surface = resolveColor("var(--mk-surface)");

        if (countries && countryFc.features.length) {
          const want = new Set(countries.map((c) => c.toLowerCase()));
          const visited = countryFc.features.filter((f) => {
            const p = f.properties as { iso?: string; names?: string };
            return (p.iso && want.has(p.iso.toLowerCase())) || (p.names ?? "").split("|").some((n) => want.has(n));
          });
          m.addSource("countries", { type: "geojson", data: { type: "FeatureCollection", features: visited } });
          m.addLayer({ id: "countries-fill", type: "fill", source: "countries", paint: { "fill-color": primary, "fill-opacity": 0.3 } });
          m.addLayer({
            id: "countries-line",
            type: "line",
            source: "countries",
            paint: { "line-color": primary, "line-width": 1, "line-opacity": 0.7 },
          });
        }

        if (circle) {
          m.addSource("circle", { type: "geojson", data: circlePolygon(circle.lon, circle.lat, circle.radius) });
          m.addLayer({ id: "circle-fill", type: "fill", source: "circle", paint: { "fill-color": primary, "fill-opacity": 0.14 } });
          m.addLayer({
            id: "circle-line",
            type: "line",
            source: "circle",
            paint: { "line-color": primary, "line-width": 1.5, "line-dasharray": [2, 2] },
          });
        }

        if (fc.features.length) {
          m.addSource("tracks", { type: "geojson", data: fc });
          const layout = { "line-cap": "round", "line-join": "round" } as const;
          m.addLayer({ id: "tracks-casing", type: "line", source: "tracks", layout, paint: { "line-color": surface, "line-width": 6, "line-opacity": 0.9 } });
          m.addLayer({
            id: "tracks",
            type: "line",
            source: "tracks",
            layout,
            paint: { "line-color": modeColorExpression() as never, "line-width": 3.5, "line-opacity": 0.95 },
          });
        }

        // Unnumbered points as one circle layer (cities, places); numbered ones as markers.
        const dots = points.filter((p) => p.num == null);
        if (dots.length) {
          m.addSource("dots", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: dots.map((p, i) => ({
                type: "Feature",
                properties: { i, label: p.label ?? "", w: p.weight ?? 0.4 },
                geometry: { type: "Point", coordinates: [p.lon, p.lat] },
              })),
            },
          });
          m.addLayer({
            id: "dots",
            type: "circle",
            source: "dots",
            paint: {
              "circle-color": primary,
              "circle-opacity": 0.9,
              "circle-radius": ["interpolate", ["linear"], ["get", "w"], 0, 4, 1, 12],
              "circle-stroke-color": surface,
              "circle-stroke-width": 2,
            },
          });
          const tip = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "mk-map-tip" });
          m.on("mousemove", "dots", (e) => {
            const f = e.features?.[0];
            if (!f) return;
            m.getCanvas().style.cursor = dots[f.properties?.i]?.href ? "pointer" : "";
            const text = String(f.properties?.label ?? "");
            if (text) tip.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setText(text).addTo(m);
          });
          m.on("mouseleave", "dots", () => {
            m.getCanvas().style.cursor = "";
            tip.remove();
          });
          m.on("click", "dots", (e) => {
            const href = dots[e.features?.[0]?.properties?.i]?.href;
            if (href) router.push(href);
          });
        }
        for (const p of points.filter((x) => x.num != null)) {
          const node = document.createElement("div");
          node.className =
            "flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-surface bg-primary px-1 text-caption font-semibold tabular-nums text-on-primary shadow-md";
          node.textContent = String(p.num);
          if (p.label) node.title = p.label;
          markers.push(new ml.Marker({ element: node }).setLngLat([p.lon, p.lat]).addTo(m));
        }

        // Fit: tracks, points and the circle; the world fits the visited countries.
        let b = extendBounds(null, fc);
        b = extendBounds(b, {
          type: "FeatureCollection",
          features: points.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
        });
        if (circle) b = extendBounds(b, { type: "FeatureCollection", features: [circlePolygon(circle.lon, circle.lat, circle.radius * 2.2)] });
        if (b) {
          if (b[0] === b[2] && b[1] === b[3]) m.jumpTo({ center: [b[0], b[1]], zoom });
          else m.fitBounds(b as LngLatBoundsLike, { padding, maxZoom: countries ? 5 : 15, duration: 0 });
        }
        setState("ready");
      });
    })();
    return () => {
      cancelled = true;
      for (const mk of markers) mk.remove();
      map?.remove();
    };
    // `key` stands for every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div
      role="img"
      aria-label={label}
      className={`relative overflow-hidden rounded-card border border-border bg-surface-2 ${className ?? "h-60 md:h-80"}`}
    >
      <div ref={ref} className="h-full w-full" />
      {state === "loading" && <div aria-hidden className="absolute inset-0 animate-pulse bg-surface-2" />}
      {state === "failed" && (
        <div className="absolute inset-0 flex items-center justify-center text-meta text-muted">Map unavailable</div>
      )}
    </div>
  );
}
