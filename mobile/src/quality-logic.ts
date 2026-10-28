// "On your phone" numbers per recording preset, from the server's recording
// quality report (GET /api/insights/quality, web/src/lib/insights/quality.ts
// and matkaPower.ts). Pure: parsing, combining the preset periods, and the
// Settings line.

import type { CustomSettings } from "./preset-logic";

type PresetKey = "low" | "balanced" | "precise" | "max" | "custom";
const PRESET_KEYS: readonly string[] = ["low", "balanced", "precise", "max", "custom"];

/** Moving minutes a preset needs before its numbers mean anything. */
export const MIN_MOVING_MINUTES = 30;

/** What the server measured for one preset, combined over its periods. */
export type PresetQuality = {
  /** Moving minutes behind the numbers. */
  minutes: number;
  /** Median reported accuracy of moving fixes (m); null when none reports one. */
  accuracyMedian: number | null;
  /** Mean time between fixes while moving (s). */
  secondsPerFix: number;
  /** Matka's estimated battery use, % of the battery per recording day; null without usage data. */
  batteryPercent: number | null;
};

export type QualityByPreset = Partial<Record<PresetKey, PresetQuality>>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const sameCustom = (v: unknown, c: CustomSettings) =>
  isObj(v) && v.accuracy === c.accuracy && v.distance === c.distance && v.time === c.time;

/**
 * Per preset, the moving stats of every period recorded with it (any Smart
 * Tracking setting; for "custom" only periods with the current custom
 * values), weighted by moving time, plus the battery estimate per day. Null
 * when the body isn't a quality report. Presets under MIN_MOVING_MINUTES are
 * left out.
 */
export function parseQualityByPreset(body: unknown, custom: CustomSettings): QualityByPreset | null {
  if (!isObj(body) || !Array.isArray(body.periods)) return null;
  type Acc = { minutes: number; seconds: number; intervals: number; accW: number; accSum: number };
  const acc = new Map<PresetKey, Acc>();
  for (const p of body.periods) {
    if (!isObj(p) || !isObj(p.preset) || !isObj(p.total) || !isObj(p.total.moving)) continue;
    const key = p.preset.preset;
    if (typeof key !== "string" || !PRESET_KEYS.includes(key)) continue;
    if (key === "custom" && !sameCustom(p.preset.custom, custom)) continue;
    const m = p.total.moving;
    const minutes = num(m.minutes);
    const spf = num(m.secondsPerFix);
    if (minutes == null || minutes <= 0 || spf == null || spf <= 0) continue;
    const a = acc.get(key as PresetKey) ?? { minutes: 0, seconds: 0, intervals: 0, accW: 0, accSum: 0 };
    a.minutes += minutes;
    a.seconds += minutes * 60;
    a.intervals += (minutes * 60) / spf;
    const med = num(m.accuracyMedian);
    const fixes = num(m.fixes);
    if (med != null && fixes != null && fixes > 0) {
      // Medians don't combine exactly; weighting by fixes is close enough for a hint.
      a.accW += fixes;
      a.accSum += med * fixes;
    }
    acc.set(key as PresetKey, a);
  }

  const battery = new Map<string, number>();
  if (Array.isArray(body.usage)) {
    for (const g of body.usage) {
      if (!isObj(g) || typeof g.preset !== "string" || !isObj(g.perDay)) continue;
      const pct = num(g.perDay.percent);
      const days = num(g.perDay.days);
      if (pct != null && pct >= 0 && days != null && days > 0) battery.set(g.preset, pct);
    }
  }

  const out: QualityByPreset = {};
  for (const [key, a] of acc) {
    if (a.minutes < MIN_MOVING_MINUTES) continue;
    out[key] = {
      minutes: Math.round(a.minutes),
      accuracyMedian: a.accW > 0 ? a.accSum / a.accW : null,
      secondsPerFix: a.seconds / a.intervals,
      batteryPercent: battery.get(key) ?? null,
    };
  }
  return out;
}

/** "0.4%", "2%", "<0.1%": battery per day. */
export function fmtBatteryPercent(p: number): string {
  if (p < 0.05) return "<0.1%";
  if (p < 10) return `${Math.round(p * 10) / 10}%`;
  return `${Math.round(p)}%`;
}

/** "31 s", "2 min", "1 min 30 s": time between fixes. */
function fmtEvery(s: number): string {
  const r = Math.round(s);
  if (r < 60) return `${Math.max(1, r)} s`;
  const m = Math.floor(r / 60);
  const rest = r % 60;
  return rest >= 5 && m < 5 ? `${m} min ${rest} s` : `${Math.round(r / 60)} min`;
}

/** "On your phone: median 8 m · a point every 31 s while moving · ≈ 0.4% battery a day". */
export function qualityLine(q: PresetQuality): string {
  const parts: string[] = [];
  if (q.accuracyMedian != null) parts.push(`median ${Math.max(1, Math.round(q.accuracyMedian))} m`);
  parts.push(`a point every ${fmtEvery(q.secondsPerFix)} while moving`);
  if (q.batteryPercent != null) parts.push(`≈ ${fmtBatteryPercent(q.batteryPercent)} battery a day`);
  return `On your phone: ${parts.join(" · ")}`;
}
