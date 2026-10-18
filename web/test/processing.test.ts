// Integration tests against a real PostGIS. Run with TEST_DATABASE_URL set
// (CI provides one); skipped otherwise. The database is wiped and migrated.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Fix } from "@/lib/ingest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const HOME = { lat: 60.17, lon: 24.94 };
const WORK = { lat: 60.2, lon: 24.94 };
const T0 = 1_760_000_000;

const fix = (ts: number, lat: number, lon: number): Fix => ({
  ts, lat, lon, accuracy: 10, altitude: null, speed: null, battery: null,
});

function dwell(start: number, secs: number, s: typeof HOME) {
  const out: Fix[] = [];
  for (let t = 0; t <= secs; t += 60) {
    const j = ((t / 60) % 3) - 1;
    out.push(fix(start + t, s.lat + j * 0.00015, s.lon));
  }
  return out;
}

function travel(start: number, a: typeof HOME, b: typeof HOME, secs: number) {
  const out: Fix[] = [];
  for (let t = 30; t < secs; t += 30) {
    const f = t / secs;
    out.push(fix(start + t, a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f));
  }
  return out;
}

/** home 1 h → drive 5 min → work 1 h → drive → home 1 h */
function day(start: number) {
  return [
    ...dwell(start, 3600, HOME),
    ...travel(start + 3600, HOME, WORK, 300),
    ...dwell(start + 3900, 3600, WORK),
    ...travel(start + 7500, WORK, HOME, 300),
    ...dwell(start + 7800, 3600, HOME),
  ];
}

d("ingest + processing", () => {
  let db: typeof import("@/lib/db");
  let points: typeof import("@/lib/points");
  let run: typeof import("@/lib/processing/run");
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const admin = new (await import("pg")).default.Client({ connectionString: url });
    await admin.connect();
    await admin.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await admin.end();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = await import("@/lib/db");
    points = await import("@/lib/points");
    run = await import("@/lib/processing/run");
  });

  beforeEach(async () => {
    await db.q("TRUNCATE users RESTART IDENTITY CASCADE");
    [{ id: userId }] = await db.q<{ id: string }>(
      `INSERT INTO users (oidc_sub) VALUES ('test') RETURNING id`,
    );
  });

  afterAll(async () => {
    await db?.pool().end();
  });

  const counts = async () =>
    (
      await db.q<{ visits: string; trips: string; places: string; dirty: Date | null }>(
        `SELECT (SELECT count(*) FROM visits) visits, (SELECT count(*) FROM trips) trips,
                (SELECT count(*) FROM places) places,
                (SELECT dirty_from FROM processing_state WHERE user_id = $1) dirty`,
        [userId],
      )
    )[0];

  it("is idempotent on re-upload", async () => {
    const fixes = day(T0);
    expect(await points.insertPoints(userId, fixes, { source: "device" })).toBe(fixes.length);
    expect(await points.insertPoints(userId, fixes, { source: "device" })).toBe(0);
  });

  it("builds visits, trips and shared places", async () => {
    await points.insertPoints(userId, day(T0), { source: "device" });
    await run.processUser(userId);
    const c = await counts();
    expect(Number(c.visits)).toBe(3);
    expect(Number(c.trips)).toBe(2);
    expect(Number(c.places)).toBe(2); // home is reused for the second visit
    expect(c.dirty).toBeNull();

    const trips = await db.q<{ mode: string; distance_m: number }>(
      `SELECT mode, distance_m FROM trips ORDER BY started_at`,
    );
    expect(trips.map((t) => t.mode)).toEqual(["driving", "driving"]);
    expect(trips[0].distance_m).toBeGreaterThan(3000);
  });

  it("extends incrementally and keeps renamed places", async () => {
    await points.insertPoints(userId, day(T0), { source: "device" });
    await run.processUser(userId);
    await db.q(
      `UPDATE places SET custom_name = 'Home'
       WHERE id = (SELECT place_id FROM visits ORDER BY started_at LIMIT 1)`,
    );

    // Next day arrives later.
    await points.insertPoints(userId, day(T0 + 86400), { source: "device" });
    await run.processUser(userId);
    const c = await counts();
    // The phone is silent overnight but the next fix is still at home, so the
    // evening and the next morning are one stay: 3 + 2 visits.
    expect(Number(c.places)).toBe(2);
    expect(Number(c.visits)).toBe(5);
    const named = await db.q<{ n: string }>(
      `SELECT count(*) n FROM visits v JOIN places p ON p.id = v.place_id WHERE p.custom_name = 'Home'`,
    );
    expect(Number(named[0].n)).toBe(3);
  });

  it("reprocesses when old points arrive late (offline queue)", async () => {
    const all = day(T0);
    const late = all.filter((f) => f.ts >= T0 + 3600 && f.ts < T0 + 7800); // the work part
    const early = all.filter((f) => !late.includes(f));
    await points.insertPoints(userId, early, { source: "device" });
    await run.processUser(userId);
    // Without the middle of the day it looks like one long stay at home.
    expect(Number((await counts()).visits)).toBe(1);

    await points.insertPoints(userId, late, { source: "device" });
    expect((await counts()).dirty).not.toBeNull();
    await run.processUser(userId);
    const c = await counts();
    expect(Number(c.visits)).toBe(3);
    expect(Number(c.trips)).toBe(2);
  });
});
