"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, LngLatBoundsLike } from "maplibre-gl";
import { MODE_META, type ModeKey } from "@/lib/modes";

type FC = GeoJSON.FeatureCollection;

// Finland fallback view when there is no data to fit to.
const FALLBACK_CENTER: [number, number] = [25.5, 64.5];
const FALLBACK_ZOOM = 4.3;

/** Whether the app is currently rendering dark (mirrors globals.css logic). */
function computeDark(): boolean {
  if (typeof window === "undefined") return true;
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Key-free OpenFreeMap vector basemaps (CARTO raster now requires an API key).
function styleUrl(dark: boolean): string {
  return dark
    ? "https://tiles.openfreemap.org/styles/dark"
    : "https://tiles.openfreemap.org/styles/positron";
}

/** Resolve a MODE_META color (which may be a CSS var) to a concrete color. */
function resolveColor(value: string): string {
  const m = value.match(/^var\((--[^)]+)\)$/);
  if (!m) return value;
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(m[1])
    .trim();
  return resolved || "#888888";
}

/** Build a maplibre `match` expression: mode property → line color. */
function modeColorExpression(): unknown {
  const expr: unknown[] = ["match", ["get", "mode"]];
  for (const key of Object.keys(MODE_META) as ModeKey[]) {
    expr.push(key, resolveColor(MODE_META[key].color));
  }
  expr.push(resolveColor(MODE_META.unknown.color)); // default
  return expr;
}

/** Extend a bounds accumulator over every coordinate in a FeatureCollection. */
function extendBounds(acc: [number, number, number, number] | null, fc: FC) {
  let b = acc;
  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lon, lat] = coords as [number, number];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      b = b
        ? [
            Math.min(b[0], lon),
            Math.min(b[1], lat),
            Math.max(b[2], lon),
            Math.max(b[3], lat),
          ]
        : [lon, lat, lon, lat];
      return;
    }
    for (const c of coords) visit(c);
  };
  for (const f of fc.features)
    if (f.geometry)
      visit(
        (f.geometry as GeoJSON.Geometry & { coordinates?: unknown })
          .coordinates,
      );
  return b;
}

const HEATMAP_PAINT = {
  "heatmap-weight": 1,
  "heatmap-intensity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    0,
    0.6,
    9,
    1.1,
    16,
    2.2,
  ],
  "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 9, 14, 16, 26],
  "heatmap-opacity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    7,
    0.9,
    16,
    0.55,
  ],
  "heatmap-color": [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0,
    "rgba(0,0,0,0)",
    0.1,
    "rgba(45,212,191,0.45)",
    0.3,
    "#22d3ee",
    0.5,
    "#34d399",
    0.7,
    "#fbbf24",
    0.9,
    "#fb923c",
    1,
    "#ef4444",
  ],
} as const;

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const pointsRef = useRef<FC | null>(null);
  const tracksRef = useRef<FC | null>(null);
  const showHeatRef = useRef(true);
  const showRoutesRef = useRef(true);

  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHeat, setShowHeat] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    let mql: MediaQueryList | null = null;
    let onThemeChange: (() => void) | null = null;

    (async () => {
      const container = containerRef.current;
      if (!container) return;

      // maplibre-gl v5 ships a UMD build with a blob-based worker (no external
      // worker file), so the default import works cleanly under Next's bundler.
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;

      let dark = computeDark();

      const m = new maplibregl.Map({
        container,
        style: styleUrl(dark),
        center: FALLBACK_CENTER,
        zoom: FALLBACK_ZOOM,
        attributionControl: { compact: true },
      });
      map = m;
      mapRef.current = m;

      m.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      m.on("error", (e) => {
        console.warn("[MapView] maplibre error", e?.error ?? e);
      });

      // Add (or re-add, after a style swap) the data sources + layers from the
      // cached GeoJSON, then apply current toggle visibility.
      const addDataLayers = () => {
        const points = pointsRef.current;
        const tracks = tracksRef.current;
        if (points && !m.getSource("points")) {
          m.addSource("points", { type: "geojson", data: points });
          m.addLayer({
            id: "heatmap",
            type: "heatmap",
            source: "points",
            paint: HEATMAP_PAINT as never,
          });
        }
        if (tracks && !m.getSource("tracks")) {
          m.addSource("tracks", { type: "geojson", data: tracks });
          m.addLayer({
            id: "routes",
            type: "line",
            source: "tracks",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": modeColorExpression() as never,
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                5,
                1.5,
                10,
                2.5,
                15,
                4.5,
              ],
              "line-opacity": 0.85,
            },
          });
        }
        if (m.getLayer("heatmap"))
          m.setLayoutProperty(
            "heatmap",
            "visibility",
            showHeatRef.current ? "visible" : "none",
          );
        if (m.getLayer("routes"))
          m.setLayoutProperty(
            "routes",
            "visibility",
            showRoutesRef.current ? "visible" : "none",
          );
      };

      m.on("load", async () => {
        if (cancelled) return;
        try {
          const [pointsRes, tracksRes] = await Promise.all([
            fetch("/api/points", { cache: "no-store" }),
            fetch("/api/tracks/geojson", { cache: "no-store" }),
          ]);
          if (!pointsRes.ok || !tracksRes.ok) {
            throw new Error(
              `points ${pointsRes.status}, tracks ${tracksRes.status}`,
            );
          }
          const points = (await pointsRes.json()) as FC;
          const tracks = (await tracksRes.json()) as FC;
          if (cancelled) return;

          pointsRef.current = points;
          tracksRef.current = tracks;
          addDataLayers();

          m.resize();
          let bbox = extendBounds(null, tracks);
          bbox = extendBounds(bbox, points);
          if (bbox) {
            m.fitBounds(bbox as LngLatBoundsLike, {
              padding: 48,
              duration: 0,
              maxZoom: 15,
            });
          }
          if (!cancelled) setStatus("ready");
        } catch (err) {
          console.error("[MapView] failed to load data", err);
          if (!cancelled) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setStatus("error");
          }
        }
      });

      // React to light/dark changes by swapping the whole style, then re-adding
      // our data layers once the new style has loaded.
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      onThemeChange = () => {
        dark = computeDark();
        m.setStyle(styleUrl(dark));
        m.once("styledata", () => {
          if (!cancelled) addDataLayers();
        });
      };
      mql.addEventListener("change", onThemeChange);
    })();

    return () => {
      cancelled = true;
      if (mql && onThemeChange) mql.removeEventListener("change", onThemeChange);
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    showHeatRef.current = showHeat;
    const map = mapRef.current;
    if (map && map.getLayer("heatmap"))
      map.setLayoutProperty(
        "heatmap",
        "visibility",
        showHeat ? "visible" : "none",
      );
  }, [showHeat]);

  useEffect(() => {
    showRoutesRef.current = showRoutes;
    const map = mapRef.current;
    if (map && map.getLayer("routes"))
      map.setLayoutProperty(
        "routes",
        "visibility",
        showRoutes ? "visible" : "none",
      );
  }, [showRoutes]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-auto absolute left-3 top-3 z-10 flex gap-1 rounded-xl border border-border bg-surface/90 p-1 shadow-lg backdrop-blur">
        <ToggleButton
          active={showHeat}
          onClick={() => setShowHeat((v) => !v)}
          label="Heatmap"
        />
        <ToggleButton
          active={showRoutes}
          onClick={() => setShowRoutes((v) => !v)}
          label="Routes"
        />
      </div>

      {showRoutes && (
        <div className="absolute bottom-3 left-3 z-10 hidden max-w-[70%] flex-wrap gap-x-3 gap-y-1 rounded-xl border border-border bg-surface/90 px-3 py-2 text-xs text-muted shadow-lg backdrop-blur sm:flex">
          {(["walking", "cycling", "driving", "train", "bus"] as ModeKey[]).map(
            (k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: MODE_META[k].color }}
                />
                {MODE_META[k].label}
              </span>
            ),
          )}
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/40 backdrop-blur-sm">
          <div className="mk-card px-4 py-2 text-sm text-muted">Loading map…</div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-x-0 top-16 z-10 mx-auto w-fit max-w-[90%]">
          <div className="mk-card border-red-500/40 px-4 py-2 text-sm text-text">
            Couldn&apos;t load map data
            {errorMsg ? <span className="text-muted"> — {errorMsg}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted hover:bg-surface-2 hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}
