import { q } from "../db";

// Reverse geocoding of places via a self-hosted Photon (PHOTON_URL, e.g.
// http://photon:2322). Optional: without it places show their category or
// "Unknown place" and can be renamed by hand.

const BATCH = 20;
const TIMEOUT_MS = 8000;

type PhotonProps = {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  city?: string;
  town?: string;
  village?: string;
  country?: string;
  osm_key?: string;
  osm_value?: string;
};

export function nameFromPhoton(p: PhotonProps): string | null {
  if (p.name) return p.name;
  if (p.street) return [p.street, p.housenumber].filter(Boolean).join(" ");
  return p.district ?? p.city ?? p.town ?? p.village ?? null;
}

/** Geocodes up to BATCH places that haven't been tried yet. Returns how many were done. */
export async function geocodePending(): Promise<number> {
  const base = process.env.PHOTON_URL?.trim().replace(/\/+$/, "");
  if (!base) return 0;
  const places = await q<{ id: string; lat: number; lon: number }>(
    `SELECT id, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lon
     FROM places WHERE geocoded_at IS NULL ORDER BY id LIMIT $1`,
    [BATCH],
  );
  let done = 0;
  for (const p of places) {
    let res: Response;
    try {
      res = await fetch(`${base}/reverse?lat=${p.lat}&lon=${p.lon}&limit=1`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      console.warn("[geocode] photon unreachable:", (err as Error).message);
      return done; // try again next tick
    }
    if (!res.ok) {
      console.warn(`[geocode] photon HTTP ${res.status}`);
      return done;
    }
    const body = (await res.json().catch(() => null)) as {
      features?: { properties?: PhotonProps }[];
    } | null;
    const props = body?.features?.[0]?.properties ?? null;
    await q(
      `UPDATE places SET geocoded_at = now(), geodata = $2,
              geo_name = $3, category = $4, city = $5, country = $6
       WHERE id = $1`,
      [
        p.id,
        props,
        props ? nameFromPhoton(props) : null,
        props?.osm_value ?? null,
        props ? (props.city ?? props.town ?? props.village ?? null) : null,
        props?.country ?? null,
      ],
    );
    done++;
  }
  return done;
}
