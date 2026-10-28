// The "On your phone" numbers for Settings: GET /api/insights/quality?days=30
// with the device token, cached in memory for an hour. Never throws; any
// failure (offline, 401, old server) is just "no numbers".

import { authHeaders, request } from "./api";
import type { Pairing } from "./pairing";
import type { CustomSettings } from "./preset-logic";
import { parseQualityByPreset, type QualityByPreset } from "./quality-logic";
import { toResult } from "./viewer";

const TTL_MS = 60 * 60_000;

let cache: { key: string; at: number; body: unknown } | null = null;
let inflight: { key: string; p: Promise<unknown> } | null = null;

async function fetchBody(p: Pairing): Promise<unknown> {
  const r = await request(`${p.server}/api/insights/quality?days=30`, { method: "GET", headers: authHeaders(p.token) });
  const res = toResult(r, (b) => (b != null && typeof b === "object" ? b : null));
  return res.ok ? res.data : null;
}

/** Per-preset numbers for this account, or null when there are none to show. */
export async function getPresetQuality(p: Pairing, custom: CustomSettings, now = Date.now()): Promise<QualityByPreset | null> {
  try {
    const key = `${p.server}|${p.token}`;
    let body: unknown;
    if (cache && cache.key === key && now - cache.at < TTL_MS) {
      body = cache.body;
    } else {
      if (!inflight || inflight.key !== key) {
        const req = { key, p: fetchBody(p) };
        inflight = req;
        const clear = () => {
          if (inflight === req) inflight = null;
        };
        req.p.then(clear, clear);
      }
      body = await inflight.p;
      // Only good answers are cached: a failure is retried next time Settings opens.
      if (body != null) cache = { key, at: now, body };
    }
    return body == null ? null : parseQualityByPreset(body, custom);
  } catch {
    return null;
  }
}
