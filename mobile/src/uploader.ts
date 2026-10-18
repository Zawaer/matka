// Drains the durable queue to the server and records the outcome for the UI.

import * as api from "./api";
import { loadPairing } from "./credentials";
import * as db from "./db";
import { backoffMs, runUpload, shouldUploadFromTask, type UploadReport } from "./upload-logic";

export type UploadReason = "task" | "foreground" | "manual";

/** Per run: the background task gets a few seconds of runtime, the foreground can drain everything. */
const MAX_BATCHES: Record<UploadReason, number> = { task: 4, foreground: 100, manual: 100 };

let running: Promise<UploadReport | null> | null = null;

/** Runs one upload pass unless one is already running (then joins it). */
export function uploadNow(reason: UploadReason): Promise<UploadReport | null> {
  if (!running) {
    running = doUpload(reason).finally(() => {
      running = null;
    });
  }
  return running;
}

async function doUpload(reason: UploadReason): Promise<UploadReport | null> {
  const pairing = await loadPairing();
  if (!pairing) return null;
  if ((await db.getKv("auth_lost")) === "1") return null;

  const now = Date.now();
  const nextRetryAt = await db.getNum("next_retry_at");
  if (reason !== "manual" && nextRetryAt != null && now < nextRetryAt) return null;

  await db.setNum("last_attempt_at", now);
  const report = await runUpload(
    {
      peek: db.peek,
      remove: db.remove,
      post: (body) => api.postPoints(pairing, body),
    },
    { maxBatches: MAX_BATCHES[reason] },
  );

  const at = Date.now();
  if (report.sent > 0) {
    await db.setNum("last_success_at", at);
    if (report.receipt) await db.setKv("last_receipt", JSON.stringify(report.receipt));
  }
  if (report.error) {
    await db.setKv("last_error", report.error);
    await db.setNum("last_error_at", at);
  }

  if (report.result === "unauthorized") {
    await db.setKv("auth_lost", "1");
  } else if (report.result === "retry") {
    const failures = ((await db.getNum("failures")) ?? 0) + 1;
    await db.setNum("failures", failures);
    await db.setNum("next_retry_at", at + backoffMs(failures));
  } else {
    await db.setNum("failures", 0);
    await db.setNum("next_retry_at", null);
  }
  return report;
}

/** Called from the background location task after new fixes are queued. */
export async function maybeUploadFromTask(): Promise<void> {
  const [pairing, queued, lastAttemptAt, nextRetryAt, authLost] = await Promise.all([
    loadPairing(),
    db.count(),
    db.getNum("last_attempt_at"),
    db.getNum("next_retry_at"),
    db.getKv("auth_lost"),
  ]);
  const due = shouldUploadFromTask({
    queued,
    now: Date.now(),
    lastAttemptAt,
    nextRetryAt,
    paired: pairing != null,
    authLost: authLost === "1",
  });
  if (due) await uploadNow("task");
}

/** Refreshes the cached GET /api/ingest status. Marks pairing lost on 401. */
export async function refreshServerStatus(): Promise<api.StatusResult | null> {
  const pairing = await loadPairing();
  if (!pairing) return null;
  const r = await api.getStatus(pairing);
  if (r.ok) {
    await db.setKv("server_status", JSON.stringify(r.status));
    await db.setNum("server_status_at", Date.now());
  } else if (r.unauthorized) {
    await markPairingLost();
  }
  return r;
}

/**
 * Any 401 (ingest, status or a viewer request) means the token is revoked or
 * invalid: stop uploading, keep the queue, show "pairing lost".
 */
export async function markPairingLost(): Promise<void> {
  await db.setKv("auth_lost", "1");
  await db.setKv("last_error", "Pairing lost: the server no longer accepts this device's token (401).");
  await db.setNum("last_error_at", Date.now());
}

/** Resets upload state after (re)pairing. The queue itself is kept. */
export async function resetUploadState(): Promise<void> {
  for (const k of ["auth_lost", "failures", "next_retry_at", "last_error", "last_error_at", "server_status", "last_receipt"]) {
    await db.setKv(k, null);
  }
}
