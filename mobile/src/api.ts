// HTTP client for the device API (docs/API.md). No retries here; callers decide.

import type { Pairing } from "./pairing";
import type { PostResult } from "./upload-logic";

const TIMEOUT_MS = 30_000;

export type ServerStatus = { device: string; points: number; last: string | null };

export type StatusResult =
  | { ok: true; status: ServerStatus }
  | { ok: false; unauthorized: boolean; error: string };

export async function request(url: string, init: RequestInit): Promise<PostResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // credentials: "omit" keeps the shared cookie jar (on Android that is the
    // WebView's, which holds the map embed cookie) out of API calls, so the
    // bearer token is the only credential and a 401 really means "token bad".
    const res = await fetch(url, { ...init, credentials: "omit", signal: ctl.signal });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep raw text (e.g. an HTML error page)
    }
    return { status: res.status, body };
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    return { status: null, body: null, error: aborted ? "timed out" : String((e as Error)?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

export const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/json" });

export function postPoints(p: Pairing, body: string): Promise<PostResult> {
  return request(`${p.server}/api/ingest`, {
    method: "POST",
    headers: { ...authHeaders(p.token), "Content-Type": "application/json" },
    body,
  });
}

/** `GET /api/ingest`: verifies the token and returns the status for the UI. */
export async function getStatus(p: Pairing): Promise<StatusResult> {
  const r = await request(`${p.server}/api/ingest`, { method: "GET", headers: authHeaders(p.token) });
  if (r.status === 401) return { ok: false, unauthorized: true, error: "The server rejected this token (401)." };
  if (r.status == null) return { ok: false, unauthorized: false, error: `Can't reach the server: ${r.error}.` };
  const b = r.body as Partial<ServerStatus> & { ok?: unknown };
  if (r.status !== 200 || typeof b !== "object" || b === null || b.ok !== true) {
    return {
      ok: false,
      unauthorized: false,
      error:
        r.status === 200
          ? "That URL answered, but it doesn't look like a Matka server."
          : `Server answered ${r.status}.`,
    };
  }
  return {
    ok: true,
    status: {
      device: typeof b.device === "string" ? b.device : "?",
      points: typeof b.points === "number" ? b.points : 0,
      last: typeof b.last === "string" ? b.last : null,
    },
  };
}
