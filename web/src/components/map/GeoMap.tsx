"use client";

// A small, read-only map for pages about somewhere: a place (its pin and
// size circle), a trip (its routes and overnight stops), a city (its places)
// and the world (visited countries filled in, cities as dots sized by time).
// Uses the same basemap, colours and controls as the day map. Loaded lazily
// (components/map/LazyGeoMap.tsx), so MapLibre only downloads where a map is.

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoot } from "react-dom/client";
import { MapPin } from "lucide-react";
import type { LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
import { computeDark, extendBounds, modeColorExpression, resolveColor, fitPadding, loadStyle, tameBasemap, workerUrl } from "./mapStyle";

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

/** Each feature's largest polygon only: France without Guiana, for fitting. */
function mainlands(fc: FC): FC {
  const area = (ring: number[][]) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    return Math.abs(a / 2);
  };
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      if (f.geometry?.type !== "MultiPolygon") return f;
      const polys = f.geometry.coordinates;
      const main = polys.reduce((best, p) => (area(p[0]) > area(best[0]) ? p : best), polys[0]);
      return { ...f, geometry: { type: "Polygon", coordinates: main } };
    }),
  };
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
      ml.setWorkerUrl(workerUrl(ml.getVersion()));
      const dark = computeDark();
      const tracks = win
        ? fetch(`/api/tracks/geojson?from=${Math.floor(win.from)}&to=${Math.ceil(win.to)}`)
            .then((r) => (r.ok ? (r.json() as Promise<FC>) : EMPTY))
            .catch(() => EMPTY)
        : Promise.resolve(EMPTY);
      const world = countries ? loadCountries().catch(() => EMPTY) : Promise.resolve(EMPTY);

      const style = await loadStyle(dark);
      if (cancelled) return;
      const m = new ml.Map({
        container: el,
        style: style as never,
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
      // Zoom buttons only on maps tall enough to explore; small context maps
      // (the place page's header) stay clean.
      const withControls = el.clientHeight >= 400 || !!countries;
      if (withControls) m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => console.warn("[GeoMap] maplibre error", e?.error ?? e));

      m.on("load", async () => {
        if (cancelled) return;
        tameBasemap(m, dark);
        const [fc, countryFc] = await Promise.all([tracks, world]);
        if (cancelled) return;
        // Data is neutral ink; the accent is kept for selection and actions.
        const ink = resolveColor("var(--mk-text-2)");
        const outline = resolveColor("var(--mk-outline)");
        const surface = resolveColor("var(--mk-surface)");

        let visitedFc: FC | null = null;
        if (countries && countryFc.features.length) {
          const want = new Set(countries.map((c) => c.toLowerCase()));
          const visited = countryFc.features.filter((f) => {
            const p = f.properties as { iso?: string; names?: string };
            return (p.iso && want.has(p.iso.toLowerCase())) || (p.names ?? "").split("|").some((n) => want.has(n));
          });
          visitedFc = { type: "FeatureCollection", features: visited };
          m.addSource("countries", { type: "geojson", data: visitedFc });
          m.addLayer({ id: "countries-fill", type: "fill", source: "countries", paint: { "fill-color": ink, "fill-opacity": 0.22 } });
          m.addLayer({
            id: "countries-line",
            type: "line",
            source: "countries",
            paint: { "line-color": outline, "line-width": 1, "line-opacity": 0.8 },
          });
        }

        if (circle) {
          m.addSource("circle", { type: "geojson", data: circlePolygon(circle.lon, circle.lat, circle.radius) });
          m.addLayer({ id: "circle-fill", type: "fill", source: "circle", paint: { "fill-color": ink, "fill-opacity": 0.12 } });
          m.addLayer({
            id: "circle-line",
            type: "line",
            source: "circle",
            paint: { "line-color": outline, "line-width": 1 },
          });
          // The place itself: a pin at the centre.
          const node = document.createElement("div");
          node.className =
            "flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-text text-bg shadow-md";
          node.setAttribute("aria-hidden", "true");
          const glyph = createRoot(node);
          glyph.render(<MapPin size={16} strokeWidth={2} aria-hidden />);
          const mk = new ml.Marker({ element: node }).setLngLat([circle.lon, circle.lat]).addTo(m);
          markers.push({ remove: () => { mk.remove(); setTimeout(() => glyph.unmount(), 0); } });
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
              "circle-color": ink,
              "circle-opacity": 0.75,
              "circle-radius": ["interpolate", ["linear"], ["get", "w"], 0, 4, 1, 12],
              "circle-stroke-color": surface,
              "circle-stroke-width": 2,
            },
          });
          // The three biggest dots carry their name, so touch screens (no
          // hover) still say what they are.
          const top = new Set(
            dots
              .map((p, i) => ({ i, w: p.weight ?? 0 }))
              .sort((a, b) => b.w - a.w)
              .slice(0, 3)
              .map((d) => d.i),
          );
          m.addLayer({
            id: "dots-label",
            type: "symbol",
            source: "dots",
            filter: ["in", ["get", "i"], ["literal", [...top]]],
            layout: {
              "text-field": ["get", "label"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 12,
              "text-anchor": "left",
              "text-offset": [1.1, 0],
              "text-optional": true,
            },
            paint: { "text-color": resolveColor("var(--mk-text)"), "text-halo-color": surface, "text-halo-width": 1.5 },
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
            "flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-text px-1 text-caption font-semibold leading-none tabular-nums text-bg shadow-md";
          node.textContent = String(p.num);
          if (p.label) node.title = p.label;
          // Up and to the right of the stop, so the city's own label stays readable.
          markers.push(new ml.Marker({ element: node, anchor: "bottom-left", offset: [2, -2] }).setLngLat([p.lon, p.lat]).addTo(m));
        }

        // Fit: tracks, points and the circle; the world fits the visited
        // countries themselves (each one's main landmass), not just the cities.
        let b = extendBounds(null, fc);
        b = extendBounds(b, {
          type: "FeatureCollection",
          features: points.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
        });
        if (circle) b = extendBounds(b, { type: "FeatureCollection", features: [circlePolygon(circle.lon, circle.lat, circle.radius * 2.2)] });
        if (visitedFc) b = extendBounds(b, mainlands(visitedFc));
        if (b) {
          const pad = withControls
            ? fitPadding(el.clientWidth, el.clientHeight, { top: padding, right: 56, bottom: padding, left: padding })
            : fitPadding(el.clientWidth, el.clientHeight, { top: padding, right: padding, bottom: padding, left: padding });
          if (b[0] === b[2] && b[1] === b[3]) m.jumpTo({ center: [b[0], b[1]], zoom });
          else m.fitBounds(b as LngLatBoundsLike, { padding: pad, maxZoom: countries ? 5 : 15, duration: 0 });
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
