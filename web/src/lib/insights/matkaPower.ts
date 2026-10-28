// Matka's own battery use per day and preset: the recorder's counted usage
// (device_daily_usage, sent by the phone in heartbeats) through the power
// model (an ESTIMATE, ./powerModel.ts), next to what the phone itself measured
// (whole-phone current and charge-counter drop while unplugged). Pure.

import { PRESET_LABELS, type PresetKey } from "../recordingPreset";
import { POWER_MODEL, type PowerEstimate, type PowerModel, estimatePower, profileFor } from "./powerModel";

export type CurrentAgg = { n: number; mean: number | null; median: number | null };

/** One device_daily_usage row. */
export type UsageRow = {
  day: string;
  preset: string;
  activeS: number;
  standbyS: number;
  offS: number;
  fixes: number;
  movingS: number;
  stillS: number;
  current: { active: CurrentAgg; standby: CurrentAgg; screen: CurrentAgg };
  dropMah: number;
  dropS: number;
};

export type UsageDay = UsageRow & { estimate: PowerEstimate };

export type UsageGroup = {
  preset: string;
  label: string;
  /** Oldest first. */
  days: UsageDay[];
  /** Averages over the days with any recording. */
  perDay: { days: number; mAh: number; percent: number; activeS: number; standbyS: number; fixes: number };
  /** Whole-phone current over the group's samples (n-weighted), mA. */
  current: { active: CurrentAgg; standby: CurrentAgg; screen: CurrentAgg };
  /** Whole-phone charge-counter drop while unplugged, summed. */
  dropMah: number;
  dropS: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** n-weighted combination (medians are approximated by their weighted mean). */
export function combineCurrent(list: CurrentAgg[]): CurrentAgg {
  const n = list.reduce((a, c) => a + c.n, 0);
  const w = (k: "mean" | "median") => {
    const xs = list.filter((c) => c.n > 0 && c[k] != null);
    const wn = xs.reduce((a, c) => a + c.n, 0);
    return wn > 0 ? r1(xs.reduce((a, c) => a + c.n * (c[k] as number), 0) / wn) : null;
  };
  return { n, mean: w("mean"), median: w("median") };
}

/** Rows of one day+preset from several devices, summed. */
function sumRows(rows: UsageRow[]): UsageRow {
  const s = (k: "activeS" | "standbyS" | "offS" | "fixes" | "movingS" | "stillS" | "dropS") =>
    rows.reduce((a, r) => a + r[k], 0);
  return {
    day: rows[0].day,
    preset: rows[0].preset,
    activeS: s("activeS"),
    standbyS: s("standbyS"),
    offS: s("offS"),
    fixes: s("fixes"),
    movingS: s("movingS"),
    stillS: s("stillS"),
    current: {
      active: combineCurrent(rows.map((r) => r.current.active)),
      standby: combineCurrent(rows.map((r) => r.current.standby)),
      screen: combineCurrent(rows.map((r) => r.current.screen)),
    },
    dropMah: r1(rows.reduce((a, r) => a + r.dropMah, 0)),
    dropS: s("dropS"),
  };
}

export function presetName(preset: string): string {
  return PRESET_LABELS[preset as PresetKey] ?? preset;
}

/**
 * Per preset (in order of first use), per day: the estimate and the
 * measurements. `custom` is the "Custom" preset's settings, when known.
 */
export function usageGroups(
  rows: UsageRow[],
  opts: { custom?: { accuracy: string; time: number } | null; model?: PowerModel; batteryMah?: number } = {},
): UsageGroup[] {
  const model = opts.model ?? POWER_MODEL;
  const byKey = new Map<string, UsageRow[]>();
  for (const r of rows) {
    const k = `${r.preset}|${r.day}`;
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }
  const days = [...byKey.values()].map(sumRows).sort((a, b) => a.day.localeCompare(b.day));
  const groups = new Map<string, UsageDay[]>();
  for (const d of days) {
    const estimate = estimatePower(d, profileFor(d.preset, opts.custom), model, opts.batteryMah ?? model.batteryMah);
    const list = groups.get(d.preset);
    if (list) list.push({ ...d, estimate });
    else groups.set(d.preset, [{ ...d, estimate }]);
  }
  return [...groups.entries()].map(([preset, list]) => {
    const rec = list.filter((d) => d.activeS + d.standbyS > 0);
    const n = rec.length;
    const avg = (f: (d: UsageDay) => number) => (n ? rec.reduce((a, d) => a + f(d), 0) / n : 0);
    return {
      preset,
      label: presetName(preset),
      days: list,
      perDay: {
        days: n,
        mAh: r1(avg((d) => d.estimate.mAh)),
        percent: r2(avg((d) => d.estimate.percent)),
        activeS: Math.round(avg((d) => d.activeS)),
        standbyS: Math.round(avg((d) => d.standbyS)),
        fixes: Math.round(avg((d) => d.fixes)),
      },
      current: {
        active: combineCurrent(list.map((d) => d.current.active)),
        standby: combineCurrent(list.map((d) => d.current.standby)),
        screen: combineCurrent(list.map((d) => d.current.screen)),
      },
      dropMah: r1(list.reduce((a, d) => a + d.dropMah, 0)),
      dropS: list.reduce((a, d) => a + d.dropS, 0),
    };
  });
}

const mins = (s: number) => (s < 5400 ? `${Math.round(s / 60)}m` : `${r1(s / 3600)}h`);
const ma = (c: CurrentAgg) => (c.n > 0 && c.median != null ? `${Math.round(c.median)}` : "–");

/**
 * Per day, compact, aggregates only:
 * `10-28 Balanced ≈12.1mAh 0.2% gps 22m sb 14h 210fx · draw act 420 sb 60 scr 900mA drop 1240mAh/9.5h`
 */
export function usageLogText(groups: UsageGroup[]): string {
  const days = groups.flatMap((g) => g.days.map((d) => ({ g, d }))).sort((a, b) => a.d.day.localeCompare(b.d.day));
  return days
    .map(({ g, d }) => {
      const est = `≈${d.estimate.mAh}mAh ${d.estimate.percent}% gps ${mins(d.activeS)} sb ${mins(d.standbyS)} ${d.fixes}fx`;
      const c = d.current;
      const meas =
        c.active.n + c.standby.n + c.screen.n > 0 || d.dropS > 0
          ? ` · draw act ${ma(c.active)} sb ${ma(c.standby)} scr ${ma(c.screen)}mA drop ${Math.round(d.dropMah)}mAh/${r1(d.dropS / 3600)}h`
          : "";
      return `${d.day.slice(5)} ${g.label} ${est}${meas}`;
    })
    .join("; ");
}
