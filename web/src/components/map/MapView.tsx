"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, LngLatBoundsLike, Marker } from "maplibre-gl";
import { createSavedPlace } from "@/app/places/actions";
import { KindPicker, SizePicker } from "@/components/places/SavedFields";
import { MODE_META, type ModeKey } from "@/lib/modes";
import { computeDark, extendBounds, modeColorExpression, resolveColor, styleUrl } from "./mapStyle";
import { PLACE_SIZES } from "@/lib/savedPlaces";
import { Check, CircleCheck, Crosshair, Flame, type LucideIcon, MapPinPlus, Route as RouteIcon, X } from "lucide-react";
import { Button, Callout, cx, IconButton, Input } from "@/components/ui";

type FC = GeoJSON.FeatureCollection;

// Finland fallback view when there is no data to fit to.
const FALLBACK_CENTER: [number, number] = [25.5, 64.5];
const FALLBACK_ZOOM = 4.3;

type Pin = { lat: number; lon: number };

/** A circle of `radius` metres around a pin, as a polygon (for the size preview). */
function circle(pin: Pin | null, radius: number): FC {
  if (!pin) return { type: "FeatureCollection", features: [] };
  const dLat = radius / 111_320;
  const dLon = radius / (111_320 * Math.cos((pin.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    ring.push([pin.lon + dLon * Math.cos(a), pin.lat + dLat * Math.sin(a)]);
  }
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
  };
}

const HEATMAP_PAINT = {
  // Hours spent per ~55 m cell (api/points). Anywhere you've been shows (so
  // regular routes still glow faintly), but time spent is what makes it hot:
  // roughly logarithmic so home doesn't drown out everywhere else.
  "heatmap-weight": [
    "interpolate",
    ["linear"],
    ["get", "h"],
    0, 0.03,
    0.05, 0.06,
    0.5, 0.15,
    3, 0.35,
    20, 0.6,
    100, 0.85,
    500, 1,
  ],
  "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 9, 0.9, 14, 1.3, 17, 2],
  "heatmap-radius": ["interpolate", ["exponential", 1.5], ["zoom"], 3, 5, 8, 10, 12, 18, 16, 32],
  "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.9, 16, 0.75],
  "heatmap-color": [
    // Thermal: deep red -> orange -> yellow -> near-white at the hottest.
    // Reads as heat on both the dark and the light basemap.
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0, "rgba(140,20,60,0)",
    0.06, "rgba(140,20,60,0.45)",
    0.2, "rgba(200,30,50,0.75)",
    0.4, "#e8402a",
    0.6, "#fb8c1a",
    0.8, "#fdd835",
    1, "#fff8d6",
  ],
} as const;

export default function MapView({ initialSave = false }: { initialSave?: boolean }) {
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

  // "Save a place": tap the map to drop a pin, then name it.
  const [saveMode, setSaveMode] = useState(initialSave);
  const saveModeRef = useRef(initialSave);
  const [pin, setPin] = useState<Pin | null>(null);
  const pinRef = useRef<Pin | null>(null);
  const [radius, setRadius] = useState<number>(PLACE_SIZES[0].radius);
  const radiusRef = useRef(radius);
  const markerRef = useRef<Marker | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedPlace, setSavedPlace] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    let mql: MediaQueryList | null = null;
    let onThemeChange: (() => void) | null = null;

    // Fetch the data alongside MapLibre and the basemap, not after them.
    const data = Promise.all([
      fetch("/api/points", { cache: "no-cache" }),
      fetch("/api/tracks/geojson", { cache: "no-cache" }),
    ]);
    data.catch(() => {}); // handled where it's awaited

    (async () => {
      const container = containerRef.current;
      if (!container) return;

      // maplibre-gl v6 is ESM with named exports only.
      const maplibregl = await import("maplibre-gl");
      // Our own copy of the worker (scripts/copy-maplibre-worker.mjs): the
      // bundler can't serve the one MapLibre looks for next to its module.
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      if (cancelled) return;
      mlRef.current = maplibregl;

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

      // OpenFreeMap's styles ask for icons their sprites lack ("circle-11",
      // "wood-pattern"); a blank stand-in keeps maplibre from warning on every load.
      m.setMissingStyleImageResolver((id) => {
        if (!m.hasImage(id)) m.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      m.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      m.on("click", (e) => {
        if (!saveModeRef.current) return;
        setPin({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        // Zoomed out, a tap is only roughly right: zoom in so the pin (tap
        // again to move it) and its size circle can be checked.
        // On a phone, keep the pin above the form sheet.
        if (m.getZoom() < 14)
          m.easeTo({ center: e.lngLat, zoom: 15, offset: [0, window.innerWidth < 640 ? -150 : 0], duration: 600 });
        setSavedPlace(null);
        setSaveError(null);
      });
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
        if (!m.getSource("pin-radius")) {
          m.addSource("pin-radius", { type: "geojson", data: circle(pinRef.current, radiusRef.current) });
          m.addLayer({
            id: "pin-radius-fill",
            type: "fill",
            source: "pin-radius",
            paint: { "fill-color": resolveColor("var(--mk-primary)"), "fill-opacity": 0.18 },
          });
          m.addLayer({
            id: "pin-radius-line",
            type: "line",
            source: "pin-radius",
            paint: { "line-color": resolveColor("var(--mk-primary)"), "line-width": 2, "line-dasharray": [2, 1.5] },
          });
        }
        // Heat on top: under the route lines it disappears where it matters.
        if (m.getLayer("heatmap") && m.getLayer("routes")) m.moveLayer("heatmap");
        // The pin's size preview above everything.
        if (m.getLayer("pin-radius-fill")) {
          m.moveLayer("pin-radius-fill");
          m.moveLayer("pin-radius-line");
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
        // MapLibre opens the compact attribution at first; start it folded to
        // the (i) button, which still shows the credits on tap.
        container
          .querySelector(".maplibregl-ctrl-attrib")
          ?.classList.remove("maplibregl-compact-show");
        try {
          const [pointsRes, tracksRes] = await data;
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

  // Pin marker and size circle follow the form.
  useEffect(() => {
    pinRef.current = pin;
    radiusRef.current = radius;
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;
    (map.getSource("pin-radius") as { setData?: (d: FC) => void } | undefined)?.setData?.(circle(pin, radius));
    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = new ml.Marker({ color: resolveColor("var(--mk-primary)") }).setLngLat([pin.lon, pin.lat]).addTo(map);
    } else markerRef.current.setLngLat([pin.lon, pin.lat]);
  }, [pin, radius]);

  useEffect(() => {
    saveModeRef.current = saveMode;
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = saveMode ? "crosshair" : "";
  }, [saveMode, status]);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pin) return;
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setSaveError(null);
    try {
      const name = String(f.get("name") ?? "");
      const res = await createSavedPlace({
        lat: pin.lat,
        lon: pin.lon,
        name,
        kind: String(f.get("kind") ?? ""),
        radius: Number(f.get("radius")),
      });
      if (!res.ok) setSaveError(res.error);
      else {
        setSavedPlace({ id: res.id, name: name.trim() || "Place" });
        setPin(null);
      }
    } catch {
      setSaveError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

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

      <div className="pointer-events-none absolute left-3 right-14 top-3 z-10 flex flex-wrap gap-2">
        <div role="group" aria-label="Layers" className={cx(PANEL, "pointer-events-auto flex gap-0.5 p-1")}>
          <ToggleButton active={showHeat} onClick={() => setShowHeat((v) => !v)} label="Heatmap" icon={Flame} />
          <ToggleButton active={showRoutes} onClick={() => setShowRoutes((v) => !v)} label="Routes" icon={RouteIcon} />
        </div>
        <div className={cx(PANEL, "pointer-events-auto flex p-1")}>
          <ToggleButton
            active={saveMode}
            onClick={() => {
              setSaveMode(!saveMode);
              setPin(null);
              setSavedPlace(null);
              setSaveError(null);
            }}
            label={saveMode ? "Done" : "Save a place"}
            icon={saveMode ? Check : MapPinPlus}
          />
        </div>
      </div>

      {saveMode && !pin && (
        <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-sm sm:left-3 sm:right-auto sm:top-16 sm:bottom-auto sm:mx-0 sm:w-[22rem]">
          <div className={cx(PANEL, "flex items-start gap-2.5 px-3.5 py-3 text-meta")}>
            {savedPlace ? (
              <>
                <CircleCheck size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0 text-success" />
                <p className="text-secondary">
                  Saved <span className="font-medium text-text">{savedPlace.name}</span>.{" "}
                  <Link href={`/places/${savedPlace.id}`} className="font-medium text-primary hover:underline">
                    Open it
                  </Link>{" "}
                  or tap the map to save another.
                </p>
              </>
            ) : (
              <>
                <Crosshair size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0 text-primary" />
                <p className="text-secondary">Tap the map where the place is. Zoom in for the exact spot.</p>
              </>
            )}
          </div>
        </div>
      )}

      {saveMode && pin && (
        <div className="absolute inset-x-3 bottom-3 z-20 mx-auto max-w-sm sm:left-3 sm:right-auto sm:top-16 sm:bottom-auto sm:mx-0 sm:w-[22rem]">
          <form
            onSubmit={onSave}
            onChange={(e) => {
              const t = e.target as unknown as HTMLInputElement;
              if (t.name === "radius") setRadius(Number(t.value));
            }}
            className={cx(PANEL, "flex max-h-[70dvh] flex-col gap-3.5 overflow-y-auto p-4")}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-heading text-text">Save this spot</h2>
              <IconButton icon={X} label="Cancel" size="sm" onClick={() => setPin(null)} />
            </div>
            <Input name="name" aria-label="Name" placeholder="Name, e.g. Mom's" maxLength={120} autoComplete="off" />
            <KindPicker compact />
            <SizePicker compact defaultValue={radius} />
            {saveError && (
              <Callout tone="danger" role="alert">
                {saveError}
              </Callout>
            )}
            <Button type="submit" variant="primary" disabled={saving} block>
              {saving ? "Saving…" : "Save place"}
            </Button>
          </form>
        </div>
      )}

      {showRoutes && !saveMode && (
        <div
          aria-label="Route colours"
          className={cx(PANEL, "absolute bottom-3 left-3 z-10 hidden max-w-[70%] flex-wrap gap-x-3.5 gap-y-1 px-3 py-2 text-caption text-secondary sm:flex")}
        >
          {(["walking", "cycling", "driving", "train", "bus"] as ModeKey[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: MODE_META[k].color }} />
              {MODE_META[k].label}
            </span>
          ))}
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 z-10 animate-pulse bg-surface-2" aria-busy="true" aria-label="Loading map" />
      )}
      {status === "error" && (
        <div className="absolute inset-x-0 top-16 z-10 mx-auto w-fit max-w-[90%]">
          <Callout tone="danger" role="alert" title="Couldn't load map data" className="bg-surface shadow-pop">
            {errorMsg}
          </Callout>
        </div>
      )}
    </div>
  );
}

/** Floating panels over the map. */
const PANEL = "rounded-card border border-border bg-surface/95 shadow-pop backdrop-blur-md";

function ToggleButton({
  active,
  onClick,
  label,
  icon: I,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-meta font-medium transition-colors",
        active ? "bg-primary/12 text-primary" : "text-secondary hover:bg-surface-2 hover:text-text",
      )}
    >
      <I size={16} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}
