// Keeps the recorder's per-day usage (usage-logic.ts) in the kv store: called
// when fixes arrive, when the mode or preset changes, on motion readings and
// from the watchdog. Read-modify-writes run one at a time; failures are
// swallowed (the stats must never break recording).

import { batterySnapshot } from "../modules/matka-activity";
import * as db from "./db";
import { estimatePower, profileFor } from "./power-model";
import { parseCustom } from "./preset-logic";
import {
  type Motion,
  type RecorderMode,
  type UsageState,
  dayTotals,
  localCalendar,
  noteBattery,
  noteFixes,
  noteMotion,
  noteState,
  parseUsage,
  usageRows,
} from "./usage-logic";

const KEY = "usage";

let chain: Promise<unknown> = Promise.resolve();
function update(fn: (s: UsageState, now: number) => UsageState | Promise<UsageState>): Promise<void> {
  const run = async () => {
    const now = Date.now();
    const next = await fn(parseUsage(await db.getKv(KEY)), now);
    await db.setKv(KEY, JSON.stringify(next));
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p.catch(() => undefined);
}

/** The recorder's state now, from what tracking.ts stores. */
async function currentState(): Promise<{ mode: RecorderMode; preset: string }> {
  const [enabled, mode, preset] = await Promise.all([db.getKv("tracking_enabled"), db.getKv("applied_mode"), db.getKv("preset")]);
  return {
    mode: enabled !== "1" ? "off" : mode === "standby" ? "standby" : "active",
    preset: preset ?? "balanced",
  };
}

/**
 * An event: attribute the time since the last one, count `fixes`, and (when
 * `battery`) take a whole-phone battery reading.
 */
export function recordUsage(opts: { fixes?: number; battery?: boolean } = {}): Promise<void> {
  return update(async (s, now) => {
    let next = noteState(s, now, await currentState());
    if (opts.fixes) next = noteFixes(next, now, opts.fixes);
    if (opts.battery) next = noteBattery(next, now, batterySnapshot());
    return next;
  });
}

/** A motion reading (null: unknown or not confident). */
export function recordMotion(motion: Motion | null): Promise<void> {
  return update((s, now) => noteMotion(s, now, motion));
}

const day = (ms: number) => localCalendar.dayOf(ms);

/** Rows for today and yesterday, for the heartbeat. */
export async function usageForHeartbeat(now = Date.now()) {
  await recordUsage();
  const s = parseUsage(await db.getKv(KEY));
  const today = day(now);
  return usageRows(s, [localCalendar.dayOf(now - 86_400_000), today].filter((d, i, a) => a.indexOf(d) === i));
}

/** Today's totals and Matka's estimated battery use, for the Recorder screen. */
export async function usageToday(now = Date.now()) {
  const s = parseUsage(await db.getKv(KEY));
  const today = day(now);
  const custom = parseCustom(await db.getKv("custom_preset"));
  let mAh = 0;
  let percent = 0;
  for (const [preset, b] of Object.entries(s.days[today] ?? {})) {
    const e = estimatePower(b, profileFor(preset, custom));
    mAh += e.mAh;
    percent += e.percent;
  }
  return { ...dayTotals(s, today), estimate: { mAh, percent } };
}
export type UsageToday = Awaited<ReturnType<typeof usageToday>>;
