// Upload decision logic (pure; native I/O is injected so this is unit-tested).
// Contract: docs/API.md → "POST /api/ingest" response table.

import { toWire, type QueuedPoint, type WirePoint } from "./points";

/** Server limit is 1000 points / 1 MB; stay well under both. */
export const BATCH_POINTS = 500;
export const BATCH_BYTES = 256 * 1024;

export type Outcome = "ok" | "drop" | "unauthorized" | "split" | "retry";

/** Maps an HTTP status (null = network error / timeout) to the collector action. */
export function classifyStatus(status: number | null): Outcome {
  if (status == null) return "retry";
  if (status === 200) return "ok";
  if (status === 400) return "drop";
  if (status === 401) return "unauthorized";
  if (status === 413) return "split";
  // 5xx per the contract; anything else unexpected (3xx, 403, 404, 429, other
  // 2xx…) is most likely a proxy or wrong URL, so keep the data and back off.
  return "retry";
}

/**
 * A 200 must carry the ingest receipt. A captive portal or an SSO proxy can
 * answer 200 with an HTML page; deleting the batch on that would lose data.
 */
export function isIngestReceipt(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return ["received", "inserted", "duplicates", "rejected"].every(
    (k) => typeof b[k] === "number" && Number.isFinite(b[k] as number),
  );
}

export function encodeBody(points: WirePoint[]): string {
  return JSON.stringify({ points });
}

/** Longest prefix of `rows` (oldest first) that fits the point and byte budget. */
export function takeBatch(
  rows: QueuedPoint[],
  maxPoints = BATCH_POINTS,
  maxBytes = BATCH_BYTES,
): QueuedPoint[] {
  const out: QueuedPoint[] = [];
  let bytes = '{"points":[]}'.length;
  for (const r of rows) {
    if (out.length >= maxPoints) break;
    const size = JSON.stringify(toWire(r)).length + 1; // + comma
    if (out.length > 0 && bytes + size > maxBytes) break;
    out.push(r);
    bytes += size;
  }
  return out;
}

export function splitInHalf<T>(arr: T[]): [T[], T[]] {
  const mid = Math.ceil(arr.length / 2);
  return [arr.slice(0, mid), arr.slice(mid)];
}

/** Exponential backoff after `failures` consecutive failures: 30 s, 1 m, 2 m … capped at 1 h. */
export function backoffMs(failures: number, baseMs = 30_000, maxMs = 60 * 60_000): number {
  if (failures <= 0) return 0;
  return Math.min(maxMs, baseMs * 2 ** Math.min(failures - 1, 20));
}

export type TriggerState = {
  queued: number;
  now: number;
  lastAttemptAt: number | null;
  nextRetryAt: number | null;
  paired: boolean;
  authLost: boolean;
};

/** Upload from the background task once enough points or enough time has accumulated. */
export const TRIGGER_POINTS = 60;
export const TRIGGER_INTERVAL_MS = 10 * 60_000;

export function shouldUploadFromTask(s: TriggerState): boolean {
  if (!s.paired || s.authLost || s.queued === 0) return false;
  if (s.nextRetryAt != null && s.now < s.nextRetryAt) return false;
  if (s.queued >= TRIGGER_POINTS) return true;
  return s.lastAttemptAt == null || s.now - s.lastAttemptAt >= TRIGGER_INTERVAL_MS;
}

// ---- The upload loop -------------------------------------------------------

export type PostResult = { status: number | null; body: unknown; error?: string };

export type UploadDeps = {
  /** Oldest queued rows first; each must have an `id`. */
  peek(limit: number): Promise<QueuedPoint[]>;
  remove(ids: number[]): Promise<void>;
  post(body: string): Promise<PostResult>;
};

export type UploadReport = {
  /** done = queue drained or batch budget used; the rest stopped early. */
  result: "done" | "unauthorized" | "retry";
  sent: number;
  dropped: number;
  batches: number;
  /** Most recent 200 receipt. */
  receipt?: Record<string, number>;
  /** Human-readable reason for the last non-200 (drop or stop). */
  error?: string;
};

type Step = "continue" | "unauthorized" | "retry";

/**
 * Drains the queue in batches, handling each response exactly as API.md says:
 * 200 delete batch · 400 drop batch · 401 stop (keep queue) · 413 split and
 * retry · 5xx / network keep and stop (caller schedules a backoff).
 */
export async function runUpload(
  deps: UploadDeps,
  opts: { maxBatches: number; batchPoints?: number; batchBytes?: number },
): Promise<UploadReport> {
  const report: UploadReport = { result: "done", sent: 0, dropped: 0, batches: 0 };

  const send = async (rows: QueuedPoint[]): Promise<Step> => {
    report.batches++;
    const res = await deps.post(encodeBody(rows.map(toWire)));
    const ids = rows.map((r) => r.id as number);
    let outcome = classifyStatus(res.status);
    if (outcome === "ok" && !isIngestReceipt(res.body)) outcome = "retry";

    switch (outcome) {
      case "ok":
        await deps.remove(ids);
        report.sent += rows.length;
        report.receipt = res.body as Record<string, number>;
        return "continue";
      case "drop":
        await deps.remove(ids);
        report.dropped += rows.length;
        report.error = `Server rejected a batch of ${rows.length} (400${errText(res.body)}); dropped it.`;
        return "continue";
      case "unauthorized":
        report.error = "Pairing lost: the server no longer accepts this device's token (401).";
        return "unauthorized";
      case "split": {
        if (rows.length === 1) {
          // A single point can't be too large in practice; never loop on it.
          await deps.remove(ids);
          report.dropped += 1;
          report.error = "Server said a single point was too large (413); dropped it.";
          return "continue";
        }
        for (const half of splitInHalf(rows)) {
          const step = await send(half);
          if (step !== "continue") return step;
        }
        return "continue";
      }
      case "retry":
        report.error =
          res.status == null
            ? `Network error${res.error ? `: ${res.error}` : ""}.`
            : res.status === 200
              ? "Server answered 200 without an ingest receipt (proxy or login page?)."
              : `Server error ${res.status}${errText(res.body)}.`;
        return "retry";
    }
  };

  for (let i = 0; i < opts.maxBatches; i++) {
    const rows = await deps.peek(opts.batchPoints ?? BATCH_POINTS);
    if (rows.length === 0) break;
    const batch = takeBatch(rows, opts.batchPoints ?? BATCH_POINTS, opts.batchBytes ?? BATCH_BYTES);
    const step = await send(batch);
    if (step !== "continue") {
      report.result = step;
      return report;
    }
  }
  return report;
}

function errText(body: unknown): string {
  const e = (body as { error?: unknown } | null)?.error;
  return typeof e === "string" && e ? `: ${e.slice(0, 120)}` : "";
}
