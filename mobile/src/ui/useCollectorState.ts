import { useCallback, useEffect, useState } from "react";
import type { ServerStatus } from "../api";
import { loadPairing } from "../credentials";
import * as db from "../db";
import type { Pairing } from "../pairing";
import { isBatteryOptimized } from "../system";
import {
  getPermissions,
  getPreset,
  isTrackingEnabled,
  isTrackingRunning,
  type PermissionState,
  type PresetKey,
} from "../tracking";

export type CollectorState = {
  pairing: Pairing | null;
  authLost: boolean;
  server: ServerStatus | null;
  serverAt: number | null;
  trackingEnabled: boolean;
  trackingRunning: boolean;
  permissions: PermissionState | null;
  preset: PresetKey;
  queued: number;
  oldestQueued: number | null;
  droppedOverflow: number;
  lastFixAt: number | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  nextRetryAt: number | null;
  failures: number;
  batteryOptimized: boolean | null;
};

const num = (v: string | undefined) => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function readState(): Promise<CollectorState> {
  const [pairing, kv, queued, oldestQueued, trackingEnabled, trackingRunning, permissions, preset, batteryOptimized] =
    await Promise.all([
      loadPairing(),
      db.getAllKv(),
      db.count(),
      db.oldestTs(),
      isTrackingEnabled(),
      isTrackingRunning(),
      getPermissions().catch(() => null),
      getPreset(),
      isBatteryOptimized(),
    ]);
  let server: ServerStatus | null = null;
  try {
    server = kv.server_status ? (JSON.parse(kv.server_status) as ServerStatus) : null;
  } catch {
    server = null;
  }
  return {
    pairing,
    authLost: kv.auth_lost === "1",
    server,
    serverAt: num(kv.server_status_at),
    trackingEnabled,
    trackingRunning,
    permissions,
    preset,
    queued,
    oldestQueued,
    droppedOverflow: num(kv.dropped_overflow) ?? 0,
    lastFixAt: num(kv.last_fix_at),
    lastAttemptAt: num(kv.last_attempt_at),
    lastSuccessAt: num(kv.last_success_at),
    lastError: kv.last_error ?? null,
    lastErrorAt: num(kv.last_error_at),
    nextRetryAt: num(kv.next_retry_at),
    failures: num(kv.failures) ?? 0,
    batteryOptimized,
  };
}

/** Polls local state while mounted (cheap: a few SQLite reads). */
export function useCollectorState(intervalMs = 3000) {
  const [state, setState] = useState<CollectorState | null>(null);
  const refresh = useCallback(async () => {
    try {
      setState(await readState());
    } catch {
      // keep the previous state; next tick retries
    }
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);
  return { state, refresh };
}
