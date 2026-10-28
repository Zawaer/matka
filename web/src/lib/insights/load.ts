// Database loaders for the Insights pages and their API routes. The logic lives
// in the pure modules next to this file.

import type { User } from "../auth";
import { correctionsStampSql, loadAddedMoves } from "../corrections";
import { q } from "../db";
import { PLACE_NAME_SQL, getPlaces } from "../places";
import { displayModeJoin, displayModeSql } from "../transit/run";
import {
  type AwayTrip,
  type Home,
  type NightPoint,
  type SavedHome,
  type StayVisit,
  DEFAULT_AWAY,
  detectAwayTrips,
} from "./awayTrips";
import {
  BATTERY_ANNOTATIONS,
  BATTERY_RULES,
  type Reading,
  compareAround,
  dailyBattery,
  dischargeSegments,
} from "./battery";
import { parseCustomPreset, parseRecordingPreset } from "../recordingPreset";
import { type UsageRow, usageGroups } from "./matkaPower";
import { POWER_CALIBRATION, POWER_MODEL } from "./powerModel";
import {
  type PresetChange,
  type QualityFix,
  type QualityStats,
  QUALITY_ANNOTATIONS,
  QUALITY_RULES,
  mergeSamples,
  presetPeriods,
  qualityReport,
  qualitySamples,
} from "./quality";
import { type SavedPlaceInfo, savedPlaceMonth } from "./savedTime";
import { type Move, daySummary, monthModes } from "./summary";
import { addDays, addMonths, dayBounds, localDate, localMonth, monthBounds } from "./time";
import { type WorldSort, cityPlaces, groupWorld } from "./world";

/**
 * Trips with their displayed mode: with line matching on, a trip whose matched
 * transit legs cover at least half of it counts as the kind covering most of it
 * (the rule of lib/transit/run.ts displayMode).
 */
export async function loadMoves(user: Pick<User, "id" | "transitLines">, from?: number, to?: number): Promise<Move[]> {
  const params: unknown[] = [user.id, user.transitLines];
  const where = ["t.user_id = $1"];
  if (from != null) {
    params.push(new Date(from));
    where.push(`t.ended_at >= $${params.length}`);
  }
  if (to != null) {
    params.push(new Date(to));
    where.push(`t.started_at < $${params.length}`);
  }
  const rows = await q<{ s: number; e: number; distance: number; mode: string }>(
    `SELECT extract(epoch FROM t.started_at)::float8 * 1000 AS s,
            extract(epoch FROM t.ended_at)::float8 * 1000 AS e,
            t.distance_m::float8 AS distance,
            ${displayModeSql("$2")} AS mode
     FROM trips t
     ${displayModeJoin("$2")}
     WHERE ${where.join(" AND ")}
     ORDER BY t.started_at`,
    params,
  );
  const moves = rows.map((r) => ({ start: r.s, end: r.e, distance: r.distance, mode: r.mode }));
  // Trips the user added where none was recorded ("Add travel") count too.
  const added = await loadAddedMoves(user.id, from, to);
  return added.length ? [...moves, ...added].sort((a, b) => a.start - b.start) : moves;
}

/** Distance and time per mode for a month, with 6 months of history per mode. */
export async function getMonthModes(user: User, month?: string) {
  const tz = user.timezone;
  const [{ last }] = await q<{ last: Date | null }>(`SELECT max(started_at) AS last FROM trips WHERE user_id = $1`, [
    user.id,
  ]);
  const m = month ?? localMonth((last ?? new Date()).getTime(), tz);
  const [from] = monthBounds(addMonths(m, -5), tz);
  const [, to] = monthBounds(m, tz);
  const [moves, [range]] = await Promise.all([
    loadMoves(user, from, to),
    q<{ first: Date | null; last: Date | null }>(
      `SELECT min(started_at) AS first, max(started_at) AS last FROM trips WHERE user_id = $1 AND mode <> 'stationary'`,
      [user.id],
    ),
  ]);
  const out = monthModes(moves, m, tz);
  return {
    ...out,
    firstMonth: range.first ? localMonth(range.first.getTime(), tz) : null,
    lastMonth: range.last ? localMonth(range.last.getTime(), tz) : null,
  };
}

/** Distance and time per mode for one local day. */
export async function getDaySummary(user: User, date: string) {
  const [from, to] = dayBounds(date, user.timezone);
  return daySummary(await loadMoves(user, from, to), date, user.timezone);
}

async function loadStays(userId: string): Promise<StayVisit[]> {
  const rows = await q<{
    place_id: string;
    lat: number;
    lon: number;
    city: string | null;
    country: string | null;
    s: number;
    e: number;
  }>(
    `SELECT v.place_id, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon, p.city, p.country,
            extract(epoch FROM v.started_at)::float8 * 1000 AS s,
            extract(epoch FROM v.ended_at)::float8 * 1000 AS e
     FROM visits v JOIN places p ON p.id = v.place_id
     WHERE v.user_id = $1 ORDER BY v.started_at`,
    [userId],
  );
  return rows.map((r) => ({
    placeId: Number(r.place_id),
    lat: r.lat,
    lon: r.lon,
    city: r.city,
    country: r.country,
    start: r.s,
    end: r.e,
  }));
}

/** Median point of each local night window (00:00–06:00), for nights without a visit. */
async function loadNightPoints(userId: string, tz: string): Promise<NightPoint[]> {
  return q<NightPoint>(
    `SELECT to_char((ts AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS date,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY ST_Y(geom::geometry)) AS lat,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY ST_X(geom::geometry)) AS lon
     FROM points
     WHERE user_id = $1 AND extract(hour FROM ts AT TIME ZONE $2) >= $3
       AND extract(hour FROM ts AT TIME ZONE $2) < $4
     GROUP BY 1 ORDER BY 1`,
    [userId, tz, DEFAULT_AWAY.nightFrom, DEFAULT_AWAY.nightTo],
  );
}

/** Places saved as home or family. */
async function loadSavedHomes(userId: string): Promise<SavedHome[]> {
  const rows = await q<{ id: string; lat: number; lon: number; name: string | null; city: string | null; country: string | null }>(
    `SELECT p.id, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon, ${PLACE_NAME_SQL} AS name,
            p.city, p.country
     FROM places p WHERE p.user_id = $1 AND p.kind IN ('home', 'family') ORDER BY p.saved_at, p.id`,
    [userId],
  );
  return rows.map((r) => ({ ...r, placeId: Number(r.id) }));
}

// Recomputed on read (a few hundred ms over years of data); cached per user
// until a new trip or visit lands.
const tripCache = new Map<string, { key: string; value: { home: Home | null; trips: AwayTrip[] } }>();

/** Trips away from home, newest first. */
export async function getAwayTrips(user: User): Promise<{ home: Home | null; trips: AwayTrip[] }> {
  const [{ key }] = await q<{ key: string }>(
    `SELECT concat_ws('/', (SELECT max(id) FROM trips WHERE user_id = $1), (SELECT count(*) FROM trips WHERE user_id = $1),
              (SELECT max(id) FROM visits WHERE user_id = $1), (SELECT count(*) FROM visits WHERE user_id = $1),
              (SELECT count(*) FROM trips WHERE user_id = $1 AND transit_checked IS NOT NULL),
              ${correctionsStampSql("$1")},
              (SELECT max(geocoded_at) FROM places WHERE user_id = $1),
              (SELECT string_agg(id || ':' || kind || ':' || COALESCE(custom_name, ''), ',' ORDER BY id)
                 FROM places WHERE user_id = $1 AND kind IN ('home', 'family')),
              $2::text, $3::text) AS key`,
    [user.id, user.timezone, user.transitLines],
  );
  const hit = tripCache.get(user.id);
  if (hit?.key === key) return hit.value;
  const [visits, moves, nightPoints, homes] = await Promise.all([
    loadStays(user.id),
    loadMoves(user),
    loadNightPoints(user.id, user.timezone),
    loadSavedHomes(user.id),
  ]);
  const value = detectAwayTrips({ visits, moves, nightPoints, tz: user.timezone, homes });
  tripCache.set(user.id, { key, value });
  return value;
}

/** Time and nights per saved place in a month (Insights card). */
export async function getSavedPlacesMonth(user: User, month: string) {
  const places = (
    await q<{ id: string; name: string | null; kind: SavedPlaceInfo["kind"] }>(
      `SELECT p.id, ${PLACE_NAME_SQL} AS name, p.kind FROM places p WHERE p.user_id = $1 AND p.kind IS NOT NULL`,
      [user.id],
    )
  ).map((r) => ({ placeId: Number(r.id), name: r.name, kind: r.kind }));
  if (places.length === 0) return { saved: 0, rows: [] };
  // A day either side for nights and visits crossing the month's edges.
  const [from, to] = monthBounds(month, user.timezone);
  const visits = await q<{ place_id: string; s: number; e: number }>(
    `SELECT v.place_id, extract(epoch FROM v.started_at)::float8 * 1000 AS s,
            extract(epoch FROM v.ended_at)::float8 * 1000 AS e
     FROM visits v JOIN places p ON p.id = v.place_id
     WHERE v.user_id = $1 AND p.kind IS NOT NULL AND v.ended_at > $2 AND v.started_at < $3
     ORDER BY v.started_at`,
    [user.id, new Date(from - 86_400_000), new Date(to + 86_400_000)],
  );
  return {
    saved: places.length,
    rows: savedPlaceMonth(
      places,
      visits.map((v) => ({ placeId: Number(v.place_id), start: v.s, end: v.e })),
      month,
      user.timezone,
    ),
  };
}

/** Cities and countries, sorted. */
export async function getWorld(user: User, sort: WorldSort = "visits") {
  return groupWorld(await getPlaces(user.id), sort);
}

/** One city's places. */
export async function getCity(user: User, city: string, country: string | null) {
  return cityPlaces(await getPlaces(user.id), city, country);
}

/** A trip with ISO timestamps, as the API returns it. */
export function tripJson(t: AwayTrip, withDays = false) {
  const { dayList, departure, arrival, cities, ...rest } = t;
  return {
    ...rest,
    departure: new Date(departure).toISOString(),
    arrival: arrival == null ? null : new Date(arrival).toISOString(),
    cities: cities.map((c) => ({ ...c, firstSeen: new Date(c.firstSeen).toISOString() })),
    ...(withDays ? { dayList } : {}),
  };
}

/**
 * The phone's battery readings in [from, to), per device, ordered by time.
 * Only points the phone app uploaded (source 'device'). The interior of a run
 * at one level is dropped in SQL: it adds nothing to the segments (its first
 * and last reading, and any reading beside a gap, are kept).
 */
export async function loadBatteryReadings(userId: string | number, from: number, to: number): Promise<Reading[][]> {
  const gapS = BATTERY_RULES.maxGapMs / 1000;
  const rows = await q<{ dev: string | null; ts: number; battery: number }>(
    `SELECT dev, ts, battery FROM (
       SELECT device_id::text AS dev, extract(epoch FROM ts)::float8 * 1000 AS ts, battery::int AS battery,
              battery IS DISTINCT FROM lag(battery) OVER w
                OR battery IS DISTINCT FROM lead(battery) OVER w
                OR extract(epoch FROM ts - lag(ts) OVER w) > $4
                OR extract(epoch FROM lead(ts) OVER w - ts) > $4 AS keep
       FROM points
       WHERE user_id = $1 AND source = 'device' AND battery IS NOT NULL AND ts >= $2 AND ts < $3
       WINDOW w AS (PARTITION BY device_id ORDER BY ts)
     ) r
     WHERE keep
     ORDER BY dev, ts`,
    [userId, new Date(from), new Date(to), gapS],
  );
  const byDevice = new Map<string | null, Reading[]>();
  for (const r of rows) {
    let list = byDevice.get(r.dev);
    if (!list) byDevice.set(r.dev, (list = []));
    list.push({ ts: r.ts, battery: r.battery });
  }
  return [...byDevice.values()];
}

/** Daily unplugged drain for the last `days` local days, with the recorder annotations. */
export async function getBatteryInsight(user: Pick<User, "id" | "timezone">, days: number) {
  const tz = user.timezone;
  const toDate = localDate(Date.now(), tz);
  const fromDate = addDays(toDate, -(days - 1));
  const [from] = dayBounds(fromDate, tz);
  const [, to] = dayBounds(toDate, tz);
  // A segment may start before the window.
  const series = await loadBatteryReadings(user.id, from - 24 * 3_600_000, to);
  const segments = series.flatMap((s) => dischargeSegments(s));
  const annotations = BATTERY_ANNOTATIONS.filter((a) => a.at >= from && a.at < to).map((a) => ({
    ...a,
    date: localDate(a.at, tz),
    ...compareAround(segments, a.at),
  }));
  return { days: dailyBattery(segments, fromDate, toDate, tz), annotations };
}

/** Preset changes for the user's phones: the code annotations plus device_preset_log. */
export async function loadPresetChanges(userId: string | number): Promise<PresetChange[]> {
  const rows = await q<{ at: number; preset: unknown }>(
    `SELECT extract(epoch FROM l.since)::float8 * 1000 AS at, l.preset
     FROM device_preset_log l JOIN devices d ON d.id = l.device_id
     WHERE d.user_id = $1 ORDER BY l.since`,
    [userId],
  );
  const logged = rows.flatMap((r) => {
    const preset = parseRecordingPreset(r.preset);
    return preset ? [{ at: r.at, preset }] : [];
  });
  return [...QUALITY_ANNOTATIONS, ...logged];
}

/** The app's fixes in [from, to), per device, ordered by time. */
export async function loadQualityFixes(userId: string | number, from: number, to: number): Promise<QualityFix[][]> {
  const rows = await q<QualityFix & { dev: string | null }>(
    `SELECT device_id::text AS dev, extract(epoch FROM ts)::float8 * 1000 AS ts,
            ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon,
            accuracy::float8 AS accuracy, speed::float8 AS speed, activity
     FROM points
     WHERE user_id = $1 AND source = 'device' AND ts >= $2 AND ts < $3
     ORDER BY device_id, ts`,
    [userId, new Date(from), new Date(to)],
  );
  const byDevice = new Map<string | null, QualityFix[]>();
  for (const { dev, ...f } of rows) {
    let list = byDevice.get(dev);
    if (!list) byDevice.set(dev, (list = []));
    list.push(f);
  }
  return [...byDevice.values()];
}

/** device_daily_usage rows of the user's phones for local days fromDate..toDate. */
export async function loadUsageRows(userId: string | number, fromDate: string, toDate: string): Promise<UsageRow[]> {
  const rows = await q<{
    day: string;
    preset: string;
    active_s: number;
    standby_s: number;
    off_s: number;
    fixes: number;
    moving_s: number;
    still_s: number;
    can: number;
    camean: number | null;
    camed: number | null;
    csn: number;
    csmean: number | null;
    csmed: number | null;
    crn: number;
    crmean: number | null;
    crmed: number | null;
    drop_mah: number;
    drop_s: number;
  }>(
    `SELECT to_char(u.day, 'YYYY-MM-DD') AS day, u.preset, u.active_s, u.standby_s, u.off_s, u.fixes, u.moving_s, u.still_s,
            u.cur_active_n AS can, u.cur_active_mean_ma AS camean, u.cur_active_median_ma AS camed,
            u.cur_standby_n AS csn, u.cur_standby_mean_ma AS csmean, u.cur_standby_median_ma AS csmed,
            u.cur_screen_n AS crn, u.cur_screen_mean_ma AS crmean, u.cur_screen_median_ma AS crmed,
            u.drop_mah, u.drop_s
     FROM device_daily_usage u JOIN devices d ON d.id = u.device_id
     WHERE d.user_id = $1 AND u.day BETWEEN $2::date AND $3::date
     ORDER BY u.day, u.preset`,
    [userId, fromDate, toDate],
  );
  return rows.map((r) => ({
    day: r.day,
    preset: r.preset,
    activeS: r.active_s,
    standbyS: r.standby_s,
    offS: r.off_s,
    fixes: r.fixes,
    movingS: r.moving_s,
    stillS: r.still_s,
    current: {
      active: { n: r.can, mean: r.camean, median: r.camed },
      standby: { n: r.csn, mean: r.csmean, median: r.csmed },
      screen: { n: r.crn, mean: r.crmean, median: r.crmed },
    },
    dropMah: r.drop_mah,
    dropS: r.drop_s,
  }));
}

/** The "Custom" preset's settings on the user's most recently heard-from phone, if any. */
async function loadCustomPreset(userId: string | number) {
  const [row] = await q<{ status: unknown }>(
    `SELECT status FROM devices WHERE user_id = $1 AND revoked_at IS NULL AND status IS NOT NULL
     ORDER BY heartbeat_at DESC NULLS LAST LIMIT 1`,
    [userId],
  );
  const s = row?.status as Record<string, unknown> | undefined;
  return s ? parseCustomPreset(s.custom) : null;
}

/** Battery capacity for the estimate's percentages: MATKA_BATTERY_MAH, else the calibration phone's. */
export function batteryMah(): number {
  const v = Number(process.env.MATKA_BATTERY_MAH);
  return Number.isFinite(v) && v >= 500 && v <= 50_000 ? v : POWER_CALIBRATION.batteryMah;
}

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

/**
 * Recording quality for the last `days` local days, per preset period, plus
 * the days around the latest change; and Matka's estimated battery use per
 * day and preset with the phone's own measurements. `now` for tests.
 */
export async function loadQuality(user: Pick<User, "id" | "timezone">, days: number, now = Date.now()) {
  const tz = user.timezone;
  const toDate = localDate(now, tz);
  const fromDate = addDays(toDate, -(days - 1));
  const [rangeFrom] = dayBounds(fromDate, tz);
  const changes = await loadPresetChanges(user.id);
  // The comparison may reach before the range: load from the latest change's window too.
  const periods = presetPeriods(changes);
  const latest = periods.length > 1 ? periods[periods.length - 1].start : Infinity;
  const loadFrom = Math.min(rangeFrom, latest - QUALITY_RULES.compareDays * 86_400_000);
  const [series, usage, custom] = await Promise.all([
    loadQualityFixes(user.id, loadFrom, now),
    loadUsageRows(user.id, fromDate, toDate),
    loadCustomPreset(user.id),
  ]);
  const samples = mergeSamples(series.map((s) => qualitySamples(s)));
  const cap = batteryMah();
  return {
    fromDate,
    toDate,
    report: qualityReport(samples, changes, fromDate, toDate, tz, now),
    usage: usageGroups(usage, { custom, batteryMah: cap }),
    model: { calibrated: POWER_MODEL.date, device: POWER_CALIBRATION.device, batteryMah: cap },
  };
}

/** loadQuality with ISO timestamps, as the API and the Insights card use it. */
export async function getQualityInsight(user: Pick<User, "id" | "timezone">, days: number) {
  const { report, ...rest } = await loadQuality(user, days);
  const c = report.comparison;
  return {
    ...rest,
    periods: report.periods.map((p) => ({ ...p, start: iso(p.start), end: iso(p.end) })),
    comparison: c && {
      ...c,
      at: iso(c.at)!,
      before: { ...c.before, from: iso(c.before.from)!, to: iso(c.before.to)! },
      after: { ...c.after, from: iso(c.after.from)!, to: iso(c.after.to)! },
    },
    rules: QUALITY_RULES,
  };
}
export type QualityInsight = Awaited<ReturnType<typeof getQualityInsight>>;
export type { QualityStats };
