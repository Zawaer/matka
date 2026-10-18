import { Unzip, UnzipInflate } from "fflate";
import { q, tx } from "../db";
import { kindOfRouteType } from "./match";

/**
 * GTFS feeds for line matching, from MATKA_TRANSIT_FEEDS: comma-separated
 * id=url pairs. Default: HSL (Helsinki region). "off" disables the feature for
 * the whole instance (users can also turn it off in Settings).
 */
const DEFAULT_FEEDS = "hsl=https://infopalvelut.storage.hsldev.com/gtfs/hsl.zip";
const CHECK_EVERY_MS = 24 * 60 * 60_000;
const NEEDED = new Set(["routes.txt", "trips.txt", "shapes.txt", "stops.txt"]);

export function configuredFeeds(): { id: string; url: string }[] {
  const raw = (process.env.MATKA_TRANSIT_FEEDS ?? DEFAULT_FEEDS).trim();
  if (!raw || raw === "off") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const eq = s.indexOf("=");
      return eq > 0 ? { id: s.slice(0, eq), url: s.slice(eq + 1) } : { id: "feed", url: s };
    });
}

/** Minimal RFC 4180 CSV reader (quoted fields, doubled quotes), header -> objects. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] ?? ""])));
}

/** Loads or refreshes every configured feed that is due. Returns true if any data changed. */
export async function refreshFeeds(): Promise<boolean> {
  let changed = false;
  for (const f of configuredFeeds()) {
    const [row] = await q<{ version: string | null; checked_at: Date | null }>(
      `SELECT version, checked_at FROM transit_feeds WHERE id = $1`,
      [f.id],
    );
    if (row?.checked_at && Date.now() - row.checked_at.getTime() < CHECK_EVERY_MS) continue;
    await q(
      `INSERT INTO transit_feeds (id, url, checked_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, checked_at = now()`,
      [f.id, f.url],
    );
    try {
      const head = await fetch(f.url, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
      const version = head.headers.get("last-modified") ?? head.headers.get("etag");
      if (version && row?.version === version) continue;
      console.log(`[transit] ${f.id}: downloading ${f.url}`);
      const counts = await storeFeed(f.id, version ?? new Date().toISOString(), await readFeed(f.url));
      console.log(`[transit] ${f.id}: loaded ${counts.routes} routes, ${counts.shapes} shapes, ${counts.stops} stops`);
      changed = true;
    } catch (err) {
      console.error(`[transit] ${f.id}: refresh failed, keeping the previous data:`, err instanceof Error ? err.message : err);
    }
  }
  return changed;
}

type FeedData = {
  routes: Record<string, string>[];
  /** shape_id -> route and headsign of the first trip using it. */
  shapeRoute: Map<string, { route: string; headsign: string }>;
  shapes: Map<string, [number, number, number][]>;
  stops: Record<string, string>[];
};

/** Splits a stream of text chunks into CSV rows (header first), one at a time. */
class CsvStream {
  private buf = "";
  private head: string[] | null = null;
  private dec = new TextDecoder();
  constructor(private onRow: (r: Record<string, string>) => void) {}
  push(chunk: Uint8Array, final: boolean) {
    this.buf += this.dec.decode(chunk, { stream: !final });
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0 || (final && this.buf.length > 0)) {
      const line = nl >= 0 ? this.buf.slice(0, nl) : this.buf;
      this.buf = nl >= 0 ? this.buf.slice(nl + 1) : "";
      // One row per line: GTFS feeds don't put newlines inside quoted fields.
      const cols = splitCsvLine(line.replace(/\r$/, ""));
      if (!this.head) this.head = cols.map((c, i) => (i === 0 ? c.replace(/^\ufeff/, "") : c));
      else if (cols.length > 1 || cols[0] !== "") this.onRow(Object.fromEntries(this.head.map((h, k) => [h, cols[k] ?? ""])));
      if (nl < 0) break;
    }
  }
}

function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(f);
      f = "";
    } else f += c;
  }
  out.push(f);
  return out;
}

/**
 * Streams the zip from the network through the unzipper and CSV parser, keeping
 * only what matching needs. The 870 MB stop_times.txt is skipped unread, and
 * neither the zip nor a whole file is ever held in memory.
 */
async function readFeed(url: string): Promise<FeedData> {
  const data: FeedData = { routes: [], shapeRoute: new Map(), shapes: new Map(), stops: [] };
  const sink: Record<string, (r: Record<string, string>) => void> = {
    "routes.txt": (r) => data.routes.push(r),
    "trips.txt": (r) => {
      if (r.shape_id && !data.shapeRoute.has(r.shape_id)) {
        data.shapeRoute.set(r.shape_id, { route: r.route_id, headsign: r.trip_headsign });
      }
    },
    "shapes.txt": (r) => {
      let a = data.shapes.get(r.shape_id);
      if (!a) data.shapes.set(r.shape_id, (a = []));
      a.push([Number(r.shape_pt_sequence), Number(r.shape_pt_lon), Number(r.shape_pt_lat)]);
    },
    "stops.txt": (r) => {
      if ((!r.location_type || r.location_type === "0") && r.stop_lat && r.stop_lon && r.stop_name) {
        data.stops.push({ stop_id: r.stop_id, stop_name: r.stop_name, stop_lat: r.stop_lat, stop_lon: r.stop_lon });
      }
    },
  };
  const seen = new Set<string>();
  let failure: Error | null = null;
  const unzip = new Unzip((file) => {
    const onRow = sink[file.name];
    if (!onRow) return; // not started = not decompressed
    seen.add(file.name);
    const csv = new CsvStream(onRow);
    file.ondata = (err, chunk, final) => {
      if (err) failure = err;
      else csv.push(chunk, final);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      unzip.push(new Uint8Array(0), true);
      break;
    }
    unzip.push(value);
    if (failure) throw failure;
  }
  if (failure) throw failure;
  for (const n of NEEDED) if (!seen.has(n)) throw new Error(`${n} missing from feed`);
  return data;
}

async function storeFeed(id: string, version: string, feed: FeedData) {
  const routes = feed.routes
    .map((r) => ({ id: r.route_id, short: r.route_short_name || r.route_long_name, long: r.route_long_name, kind: kindOfRouteType(Number(r.route_type)) }))
    .filter((r): r is typeof r & { kind: NonNullable<typeof r.kind> } => r.kind !== null && !!r.short);
  const routeIds = new Set(routes.map((r) => r.id));

  const shapeRoute = new Map([...feed.shapeRoute].filter(([, v]) => routeIds.has(v.route)));
  const shapes = [...feed.shapes]
    .filter(([sid, pts]) => pts.length >= 2 && shapeRoute.has(sid))
    .map(([sid, pts]) => {
      pts.sort((a, b) => a[0] - b[0]);
      return { sid, ...shapeRoute.get(sid)!, wkt: `LINESTRING(${pts.map(([, lon, lat]) => `${lon} ${lat}`).join(",")})` };
    });
  // Only stops, not stations or entrances (filtered while reading).
  const stops = feed.stops;

  await tx(async (c) => {
    await c.query(`DELETE FROM transit_routes WHERE feed_id = $1`, [id]);
    await c.query(
      `INSERT INTO transit_routes (feed_id, route_id, short_name, long_name, kind)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[])`,
      [id, routes.map((r) => r.id), routes.map((r) => r.short), routes.map((r) => r.long || null), routes.map((r) => r.kind)],
    );
    for (let k = 0; k < shapes.length; k += 200) {
      const b = shapes.slice(k, k + 200);
      await c.query(
        `INSERT INTO transit_shapes (feed_id, shape_id, route_id, headsign, path, seen_at)
         SELECT $1, t.sid, t.route, t.headsign, ST_GeogFromText(t.wkt), now()
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS t(sid, route, headsign, wkt)
         ON CONFLICT (feed_id, shape_id) DO UPDATE
           SET route_id = EXCLUDED.route_id, headsign = EXCLUDED.headsign, path = EXCLUDED.path, seen_at = now()`,
        [id, b.map((s) => s.sid), b.map((s) => s.route), b.map((s) => s.headsign || null), b.map((s) => s.wkt)],
      );
    }
    // Shapes of routes that no longer exist, or unseen for over a year, go.
    await c.query(
      `DELETE FROM transit_shapes s WHERE feed_id = $1 AND (seen_at < now() - interval '400 days'
         OR NOT EXISTS (SELECT 1 FROM transit_routes r WHERE r.feed_id = s.feed_id AND r.route_id = s.route_id))`,
      [id],
    );
    await c.query(`DELETE FROM transit_stops WHERE feed_id = $1`, [id]);
    await c.query(
      `INSERT INTO transit_stops (feed_id, stop_id, name, geom)
       SELECT $1, t.id, t.name, ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography
       FROM unnest($2::text[], $3::text[], $4::float8[], $5::float8[]) AS t(id, name, lat, lon)`,
      [id, stops.map((s) => s.stop_id), stops.map((s) => s.stop_name), stops.map((s) => Number(s.stop_lat)), stops.map((s) => Number(s.stop_lon))],
    );
    await c.query(`UPDATE transit_feeds SET version = $2, loaded_at = now() WHERE id = $1`, [id, version]);
  });
  return { routes: routes.length, shapes: shapes.length, stops: stops.length };
}
