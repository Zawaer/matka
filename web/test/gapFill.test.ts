// Integration tests of the gap-fill rule against a real PostGIS. Run with
// TEST_DATABASE_URL set; skipped otherwise. The database is wiped and migrated.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FillFix } from "@/lib/gapFill";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const T0 = 1_760_000_000;

d("gap fill", () => {
  let db: typeof import("@/lib/db");
  let gap: typeof import("@/lib/gapFill");
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const admin = new (await import("pg")).default.Client({ connectionString: url });
    await admin.connect();
    await admin.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await admin.end();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = await import("@/lib/db");
    gap = await import("@/lib/gapFill");
  });

  beforeEach(async () => {
    await db.q("TRUNCATE users RESTART IDENTITY CASCADE");
    [{ id: userId }] = await db.q<{ id: string }>(`INSERT INTO users (oidc_sub) VALUES ('test') RETURNING id`);
  });

  afterAll(async () => {
    await db?.pool().end();
  });

  const existing = (source: string, ...ts: number[]) =>
    db.q(
      `INSERT INTO points (user_id, source, ts, geom, accuracy)
       SELECT $1, $2, to_timestamp(t), ST_SetSRID(ST_MakePoint(24.94, 60.17), 4326)::geography, 10 FROM unnest($3::int8[]) t`,
      [userId, source, ts],
    );
  const fx = (ts: number, extra: Partial<FillFix> = {}): FillFix => ({ ts, lat: 60.2, lon: 24.9, accuracy: 50, ...extra });
  const fill = (source: string, notRecorded: string[], fixes: FillFix[]) =>
    db.tx((c) => gap.insertIntoGaps(c, userId, source, notRecorded, fixes));
  const sources = async () =>
    (await db.q<{ source: string; t: string }>(`SELECT source, extract(epoch FROM ts)::int8 - ${T0} AS t FROM points ORDER BY ts`)).map(
      (r) => `${r.source}@${r.t}`,
    );

  it("skips fixes within 10 min of a recorded point, keeps the rest, marks dirty from the first added", async () => {
    await existing("device", T0);
    const r = await fill("google", ["google", "photo"], [fx(T0 - 601), fx(T0 - 600), fx(T0 + 300), fx(T0 + 600), fx(T0 + 601), fx(T0 + 3600)]);
    expect(r).toMatchObject({ candidates: 6, covered: 3, inserted: 3, duplicate: 0, minTs: T0 - 601, maxTs: T0 + 3600 });
    expect(await sources()).toEqual(["google@-601", "device@0", "google@601", "google@3600"]);
    const [ps] = await db.q<{ d: string }>(`SELECT extract(epoch FROM dirty_from)::int8 d FROM processing_state WHERE user_id = $1`, [userId]);
    expect(Number(ps.d)).toBe(T0 - 601);
  });

  it("doesn't let its own source or photo locations count as recorded", async () => {
    await existing("google", T0);
    await existing("photo", T0 + 1200);
    const r = await fill("google", ["google", "photo"], [fx(T0), fx(T0 + 60), fx(T0 + 1260)]);
    expect(r).toMatchObject({ covered: 0, inserted: 2, duplicate: 1 });
  });

  it("Dawarich top-up: earlier Dawarich points don't block, Matka's own and Google's do", async () => {
    await existing("import", T0);
    await existing("device", T0 + 7200);
    await existing("google", T0 + 14_400);
    const r = await fill("import", ["import", "photo"], [fx(T0 + 60), fx(T0 + 7300), fx(T0 + 14_500), fx(T0 + 20_000)]);
    expect(r).toMatchObject({ inserted: 2, covered: 2 });
    expect(await sources()).toContain("import@60");
    expect(await sources()).toContain("import@20000");
  });

  it("dedupes within a batch, drops invalid positions, keeps only Matka's activities", async () => {
    const r = await fill("google", ["google", "photo"], [
      fx(T0, { activity: "walking" }),
      fx(T0 + 0.4, { activity: "still" }),
      fx(T0 + 60, { lat: 95 }),
      fx(T0 + 120, { activity: "flying" }),
    ]);
    expect(r).toMatchObject({ candidates: 2, inserted: 2 });
    const acts = await db.q<{ activity: string | null }>(`SELECT activity FROM points ORDER BY ts`);
    expect(acts.map((a) => a.activity)).toEqual(["walking", null]);
  });

  it("adds nothing on a re-run", async () => {
    const fixes = [fx(T0), fx(T0 + 60)];
    await fill("google", ["google", "photo"], fixes);
    const r = await fill("google", ["google", "photo"], fixes);
    expect(r).toMatchObject({ inserted: 0, covered: 0, duplicate: 2, minTs: null });
  });
});
