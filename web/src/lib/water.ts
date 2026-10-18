import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

/**
 * Land/water lookup for the Baltic region (9–32°E, 53–71°N) at ~220 m, from a
 * bundled raster of OpenStreetMap's land polygons (data/land-mask.bin, built by
 * scripts/build-land-mask.md). Used to recognise ferry crossings.
 */
type Mask = { west: number; north: number; dlon: number; dlat: number; width: number; height: number; bits: Buffer };
let mask: Mask | null | undefined;

function load(): Mask | null {
  if (mask !== undefined) return mask;
  const candidates = [path.join(process.cwd(), "data/land-mask.bin"), path.join(process.cwd(), "web/data/land-mask.bin")];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) {
    console.warn("[water] data/land-mask.bin not found; ferry detection is off");
    return (mask = null);
  }
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 8).toString() !== "MKLAND1\n") throw new Error("land-mask.bin: bad header");
  const n = buf.readUInt32BE(8);
  const meta = JSON.parse(buf.subarray(12, 12 + n).toString());
  return (mask = { ...meta, bits: inflateSync(buf.subarray(12 + n)) });
}

/** true = water, false = land, null = outside the covered region (unknown). */
export function isWater(lat: number, lon: number): boolean | null {
  const m = load();
  if (!m) return null;
  const col = Math.floor((lon - m.west) / m.dlon);
  const row = Math.floor((m.north - lat) / m.dlat);
  if (col < 0 || row < 0 || col >= m.width || row >= m.height) return null;
  const i = row * m.width + col;
  return (m.bits[i >> 3] & (0x80 >> (i & 7))) === 0;
}

/** Share of the known points that lie on water; null if none are in the region. */
export function waterFraction(coords: [number, number][]): number | null {
  let known = 0;
  let water = 0;
  for (const [lon, lat] of coords) {
    const w = isWater(lat, lon);
    if (w === null) continue;
    known++;
    if (w) water++;
  }
  return known ? water / known : null;
}
