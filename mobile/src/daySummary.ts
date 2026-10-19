// The timeline's per-day summary strip: `GET /api/day-summary?date=` (server:
// web/src/lib/insights/summary.ts daySummary) and which modes to show. Pure
// apart from fetch; tested in __tests__/daySummary.test.ts.

import { authHeaders, request } from "./api";
import type { Pairing } from "./pairing";
import { parseModeTotals, type ModeTotal } from "./insights";
import { toResult, type ViewerResult } from "./viewer";

export type { ModeTotal };

export type DaySummary = {
  date: string;
  /** Metres, all modes. */
  distance: number;
  /** Seconds, all modes. */
  duration: number;
  modes: ModeTotal[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseDaySummary(body: unknown): DaySummary | null {
  if (!isObj(body) || typeof body.date !== "string" || !Array.isArray(body.modes)) return null;
  const modes = parseModeTotals(body.modes);
  return { date: body.date, distance: n(body.distance), duration: n(body.duration), modes };
}

export async function getDaySummary(p: Pairing, date: string): Promise<ViewerResult<DaySummary>> {
  if (!DATE_RE.test(date)) return { ok: false, unauthorized: false, error: `Invalid date ${date}.` };
  const r = await request(`${p.server}/api/day-summary?date=${date}`, { method: "GET", headers: authHeaders(p.token) });
  return toResult(r, parseDaySummary);
}

/** Modes worth a chip (any distance or time), largest distance first, then longest time. */
export function stripModes(summary: Pick<DaySummary, "modes"> | null | undefined): ModeTotal[] {
  return (summary?.modes ?? [])
    .filter((m) => m.mode !== "stationary" && (m.distance > 0 || m.duration > 0))
    .sort((a, b) => b.distance - a.distance || b.duration - a.duration);
}
