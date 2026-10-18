#!/usr/bin/env node
// Copies location history from a Dawarich database into Matka.
//
//   DATABASE_URL=<matka db> node scripts/import-dawarich.mjs \
//     --from postgres://user:pass@host:5432/dawarich_development \
//     --to <your email or OIDC sub in Matka> [--dawarich-user <id>]
//
// Sign in to Matka once first so your user exists. Safe to re-run: points
// already present (same second) are skipped. Visits and trips are then
// computed by Matka's worker; Dawarich's own visits/tracks are not copied.
import { parseArgs } from "node:util";
import pg from "pg";

const { values: args } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    "dawarich-user": { type: "string" },
  },
});
const fail = (msg) => {
  console.error(`import-dawarich: ${msg}`);
  process.exit(1);
};
if (!process.env.DATABASE_URL) fail("DATABASE_URL (Matka's database) is not set");
if (!args.from) fail("--from <Dawarich database URL> is required");
if (!args.to) fail("--to <Matka user email or OIDC sub> is required");

const PAGE = 5000;
const src = new pg.Client({ connectionString: args.from });
const dst = new pg.Client({ connectionString: process.env.DATABASE_URL });
await src.connect();
await dst.connect();

try {
  const users = (
    await dst.query(`SELECT id, oidc_sub, email FROM users WHERE oidc_sub = $1 OR lower(email) = lower($1)`, [
      args.to,
    ])
  ).rows;
  if (users.length !== 1) {
    const all = (await dst.query(`SELECT oidc_sub, email FROM users ORDER BY id`)).rows;
    fail(
      `no single Matka user matches "${args.to}". Known users:\n` +
        (all.map((u) => `  ${u.email ?? "(no email)"}  sub=${u.oidc_sub}`).join("\n") ||
          "  (none — sign in to Matka once first)"),
    );
  }
  const userId = users[0].id;

  let dUser = args["dawarich-user"];
  if (!dUser) {
    const du = (await src.query(`SELECT DISTINCT user_id FROM points`)).rows;
    if (du.length !== 1) fail(`Dawarich has points for users ${du.map((r) => r.user_id).join(", ")}; pick one with --dawarich-user`);
    dUser = du[0].user_id;
  }

  const hasAnomaly = (
    await src.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'points' AND column_name = 'anomaly'`,
    )
  ).rowCount;

  const [{ n: total }] = (
    await src.query(`SELECT count(*)::int n FROM points WHERE user_id = $1 AND lonlat IS NOT NULL`, [dUser])
  ).rows;
  console.log(`import-dawarich: ${total} points from Dawarich user ${dUser} → Matka user ${users[0].email ?? users[0].oidc_sub}`);

  let after = 0;
  let seen = 0;
  let inserted = 0;
  let minTs = null;
  for (;;) {
    // Dawarich's velocity units vary by client, so speed is left for Matka to
    // derive from positions.
    const { rows } = await src.query(
      `SELECT id, timestamp AS ts, ST_X(lonlat::geometry) AS lon, ST_Y(lonlat::geometry) AS lat,
              accuracy, altitude, battery
       FROM points
       WHERE user_id = $1 AND id > $2 AND lonlat IS NOT NULL
         ${hasAnomaly ? "AND anomaly IS NOT TRUE" : ""}
       ORDER BY id LIMIT $3`,
      [dUser, after, PAGE],
    );
    if (rows.length === 0) break;
    after = rows[rows.length - 1].id;
    seen += rows.length;

    const res = await dst.query(
      `WITH ins AS (
         INSERT INTO points (user_id, source, ts, geom, accuracy, altitude, battery)
         SELECT $1, 'import', to_timestamp(t.ts), ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography,
                t.accuracy, t.altitude, CASE WHEN t.battery BETWEEN 0 AND 100 THEN t.battery END
         FROM unnest($2::int8[], $3::float8[], $4::float8[], $5::real[], $6::real[], $7::int2[])
           AS t(ts, lon, lat, accuracy, altitude, battery)
         WHERE t.lat BETWEEN -90 AND 90 AND t.lon BETWEEN -180 AND 180
         ON CONFLICT (user_id, ts) DO NOTHING
         RETURNING ts)
       SELECT count(*)::int n, min(ts) min FROM ins`,
      [
        userId,
        rows.map((r) => r.ts),
        rows.map((r) => r.lon),
        rows.map((r) => r.lat),
        rows.map((r) => r.accuracy),
        rows.map((r) => r.altitude),
        rows.map((r) => (r.battery == null ? null : Math.round(r.battery))),
      ],
    );
    inserted += res.rows[0].n;
    const m = res.rows[0].min;
    if (m && (!minTs || m < minTs)) minTs = m;
    process.stdout.write(`\r  ${seen}/${total} read, ${inserted} new`);
  }
  process.stdout.write("\n");

  if (minTs) {
    await dst.query(
      `INSERT INTO processing_state (user_id, dirty_from) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET dirty_from = LEAST(COALESCE(processing_state.dirty_from, EXCLUDED.dirty_from), EXCLUDED.dirty_from)`,
      [userId, minTs],
    );
  }
  console.log(
    `import-dawarich: done, ${inserted} new points (${seen - inserted} already present or invalid). ` +
      `Matka will compute visits and trips within a minute.`,
  );
} finally {
  await src.end();
  await dst.end();
}
