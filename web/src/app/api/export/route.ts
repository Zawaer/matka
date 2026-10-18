import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE = 10_000;

type Row = {
  id: string;
  ts: Date;
  lat: number;
  lon: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  battery: number | null;
};

/** GET /api/export?format=csv|geojson — all of the user's points, streamed. */
export async function GET(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const geojson = new URL(req.url).searchParams.get("format") === "geojson";
  const enc = new TextEncoder();

  // Pull-based so a slow or vanished client never makes us buffer the whole
  // history; one page is read per pull.
  let c: PoolClient | null = null;
  let after = "0";
  let first = true;
  let done = false;
  const release = () => {
    c?.release();
    c = null;
  };
  const stream = new ReadableStream<Uint8Array>({
    async start(ctl) {
      c = await pool().connect();
      ctl.enqueue(
        enc.encode(
          geojson
            ? '{"type":"FeatureCollection","features":[\n'
            : "time,lat,lon,accuracy_m,altitude_m,speed_ms,battery\n",
        ),
      );
    },
    async pull(ctl) {
      if (done || !c) return;
      try {
        const { rows } = await c.query<Row>(
          `SELECT id, ts, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lon,
                  accuracy, altitude, speed, battery
           FROM points WHERE user_id = $1 AND id > $2 ORDER BY id LIMIT $3`,
          [user.id, after, PAGE],
        );
        let out = "";
        for (const r of rows) {
          const t = r.ts.toISOString();
          if (geojson) {
            out += `${first ? "" : ",\n"}${JSON.stringify({
              type: "Feature",
              geometry: { type: "Point", coordinates: [r.lon, r.lat] },
              properties: { time: t, accuracy: r.accuracy, altitude: r.altitude, speed: r.speed, battery: r.battery },
            })}`;
            first = false;
          } else {
            out += [t, r.lat, r.lon, r.accuracy ?? "", r.altitude ?? "", r.speed ?? "", r.battery ?? ""].join(",") + "\n";
          }
        }
        if (rows.length < PAGE) {
          done = true;
          if (geojson) out += "\n]}\n";
        } else {
          after = rows[rows.length - 1].id;
        }
        if (out) ctl.enqueue(enc.encode(out));
        if (done) {
          release();
          ctl.close();
        }
      } catch (err) {
        console.error("[/api/export] failed:", err);
        release();
        ctl.error(err);
      }
    },
    cancel() {
      done = true;
      release();
    },
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "content-type": geojson ? "application/geo+json" : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="matka-${date}.${geojson ? "geojson" : "csv"}"`,
      "cache-control": "no-store",
    },
  });
}
