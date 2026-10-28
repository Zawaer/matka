// The OpenFreeMap basemap style, fetched and tamed (transformStyle) on the
// server, so /embed/day can put it straight into the page: the phone then
// needs no style request, no TileJSON request and no transform before the
// first tiles. Kept in memory for an hour and refreshed in the background;
// when OpenFreeMap can't be reached the page falls back to loading the style
// itself (mapStyle.ts loadStyle).

import { styleUrl, transformStyle } from "@/components/map/mapStyle";

type Source = { type?: string; url?: string } & Record<string, unknown>;
type Style = { layers: { id: string; type: string }[]; sources?: Record<string, Source> } & Record<string, unknown>;

/** Fresh for an hour (OpenFreeMap's TileJSON says max-age=3600), then served while refreshing. */
const FRESH_MS = 60 * 60 * 1000;
/** After a failure, don't try again (and slow pages down) for this long. */
const RETRY_MS = 10 * 60 * 1000;
/** A page waits at most this long for a style it doesn't have yet. */
const WAIT_MS = 1500;

type Entry = { at: number; style: Style | null; pending: Promise<Style | null> | null };
const cache = new Map<boolean, Entry>();

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/**
 * A vector source given by TileJSON `url` gets that TileJSON's fields
 * inline (tiles, zoom range, bounds, attribution), so MapLibre asks for tiles
 * at once. Pure; returns a new source.
 */
export function inlineTileJson(src: Source, tj: Record<string, unknown>): Source {
  if (!Array.isArray(tj.tiles) || !tj.tiles.every((t) => typeof t === "string")) return src;
  // Everything but `url`, plus the fields MapLibre reads from a TileJSON.
  const out: Source = Object.fromEntries(Object.entries(src).filter(([k]) => k !== "url"));
  for (const k of ["tiles", "minzoom", "maxzoom", "bounds", "attribution", "scheme"] as const) {
    if (tj[k] !== undefined && out[k] === undefined) out[k] = tj[k];
  }
  return out;
}

/**
 * The first glyph range (Latin) of every font the style's labels use: the
 * labels can't be drawn before these, and MapLibre only asks for them after
 * the first tiles are parsed. Pure; at most `max` URLs.
 */
export function glyphUrls(style: Record<string, unknown>, max = 3): string[] {
  const tpl = typeof style.glyphs === "string" ? style.glyphs : null;
  if (!tpl || !Array.isArray(style.layers)) return [];
  const stacks = new Set<string>();
  for (const l of style.layers as { layout?: Record<string, unknown> }[]) {
    const font = l.layout?.["text-font"];
    // Expressions (data-driven fonts) can't be resolved here; plain lists only.
    if (Array.isArray(font) && font.length && font.every((f) => typeof f === "string")) stacks.add(font.join(","));
  }
  return [...stacks]
    .slice(0, max)
    .map((st) => tpl.replace("{fontstack}", encodeURIComponent(st)).replace("{range}", "0-255"));
}

async function build(dark: boolean): Promise<Style> {
  const raw = (await getJson(styleUrl(dark))) as Style;
  const style = transformStyle(raw, dark);
  const sources: Record<string, Source> = { ...(style.sources ?? {}) };
  await Promise.all(
    Object.entries(sources).map(async ([id, src]) => {
      if (src.type !== "vector" || typeof src.url !== "string") return;
      sources[id] = inlineTileJson(src, (await getJson(src.url)) as Record<string, unknown>);
    }),
  );
  return { ...style, sources };
}

function refresh(dark: boolean, e: Entry): Promise<Style | null> {
  e.pending ??= build(dark).then(
    (style) => {
      Object.assign(e, { at: Date.now(), style, pending: null });
      return style;
    },
    (err) => {
      console.warn("[basemap] couldn't load the OpenFreeMap style", err instanceof Error ? err.message : err);
      // Keep a stale style if there is one; retry later either way.
      Object.assign(e, { at: Date.now() - FRESH_MS + RETRY_MS, pending: null });
      return e.style;
    },
  );
  return e.pending;
}

/** The tamed basemap style for a theme, or null (the client loads it then). */
export async function basemapStyle(dark: boolean): Promise<Style | null> {
  let e = cache.get(dark);
  if (!e) {
    e = { at: 0, style: null, pending: null };
    cache.set(dark, e);
  }
  if (Date.now() - e.at < FRESH_MS) return e.style;
  const next = refresh(dark, e);
  if (e.style) return e.style; // stale: serve it, refresh behind
  return Promise.race([next, new Promise<null>((ok) => setTimeout(() => ok(null), WAIT_MS))]);
}
