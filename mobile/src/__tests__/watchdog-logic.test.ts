import {
  ACTIVE_STALE_MS,
  HEARTBEAT_EVERY_MS,
  KEEP_RECOVERIES,
  MAX_RECOVERIES_PER_DAY,
  MIN_RECOVERY_GAP_MS,
  MOVING_STALE_MS,
  QUIET_ACTIVE_STALE_MS,
  STANDBY_STALE_MS,
  addRecovery,
  buildHeartbeat,
  decide,
  describeRecovery,
  heartbeatDue,
  parseRecoveries,
  type Recovery,
  type WatchdogInput,
} from "../watchdog-logic";

const now = 1_760_868_000_000;
const MIN = 60_000;
const H = 60 * MIN;

const base: WatchdogInput = {
  now,
  enabled: true,
  permitted: true,
  running: true,
  mode: "active",
  lastFixAt: now - 5 * MIN,
  lastMovingAt: null,
  standbyPossible: true,
  startedAt: now - 10 * H,
  recoveries: [],
};
const rec = (at: number, over: Partial<Recovery> = {}): Recovery => ({
  at,
  reason: "stale_active",
  action: "reregister",
  lastFixAt: null,
  ok: true,
  ...over,
});

describe("decide", () => {
  test("does nothing when recording is off or permission is gone", () => {
    expect(decide({ ...base, enabled: false, running: false }).action).toBe("none");
    expect(decide({ ...base, permitted: false, running: false }).action).toBe("none");
  });

  test("starts updates that aren't running", () => {
    const d = decide({ ...base, running: false });
    expect(d).toMatchObject({ action: "start", reason: "not_running" });
  });

  test("healthy: recent fix", () => {
    expect(decide(base).action).toBe("none");
  });

  test("active mode: re-registers after 45 min without a fix", () => {
    expect(decide({ ...base, lastFixAt: now - ACTIVE_STALE_MS + MIN }).action).toBe("none");
    const d = decide({ ...base, lastFixAt: now - ACTIVE_STALE_MS - MIN });
    expect(d).toMatchObject({ action: "reregister", reason: "stale_active" });
    expect(d.why).toBe("no location for 46 min");
  });

  test("active mode without standby (smart off / no motion sensor) waits longer", () => {
    const input = { ...base, standbyPossible: false, lastFixAt: now - ACTIVE_STALE_MS - MIN };
    expect(decide(input).action).toBe("none");
    expect(decide({ ...input, lastFixAt: now - QUIET_ACTIVE_STALE_MS - MIN }).action).toBe("reregister");
  });

  test("standby tolerates hours of silence", () => {
    const input = { ...base, mode: "standby" as const, lastFixAt: now - 5 * H };
    expect(decide(input).action).toBe("none");
    expect(decide({ ...input, lastFixAt: now - STANDBY_STALE_MS - MIN })).toMatchObject({
      action: "reregister",
      reason: "stale_standby",
    });
  });

  test("motion says moving: 20 min without a fix is enough, even in standby", () => {
    const input = { ...base, mode: "standby" as const, lastMovingAt: now - 2 * MIN, lastFixAt: now - MOVING_STALE_MS - MIN };
    expect(decide(input)).toMatchObject({ action: "reregister", reason: "stale_moving" });
    expect(decide(input).why).toBe("no location for 21 min while moving");
    // An old moving reading doesn't count.
    expect(decide({ ...input, lastMovingAt: now - 3 * H }).action).toBe("none");
  });

  test("the clock starts at the last (re)start, not at an old fix", () => {
    expect(decide({ ...base, lastFixAt: now - 10 * H, startedAt: now - 10 * MIN }).action).toBe("none");
    expect(decide({ ...base, lastFixAt: null, startedAt: now - 10 * MIN }).action).toBe("none");
    expect(decide({ ...base, lastFixAt: null, startedAt: null }).action).toBe("none");
  });

  test("a re-register that brought no fix escalates to a restart, with a doubled wait", () => {
    const lastFixAt = now - 3 * H;
    const first = rec(now - 50 * MIN, { lastFixAt });
    // 50 min since the re-register < 2 × 45 min: wait.
    expect(decide({ ...base, lastFixAt, recoveries: [first] }).action).toBe("none");
    const older = rec(now - 95 * MIN, { lastFixAt });
    expect(decide({ ...base, lastFixAt, recoveries: [older] })).toMatchObject({ action: "restart" });
  });

  test("a fix after the recovery resets the escalation", () => {
    const r = rec(now - 2 * H, { lastFixAt: now - 3 * H });
    expect(decide({ ...base, lastFixAt: now - 46 * MIN, recoveries: [r] }).action).toBe("reregister");
  });

  test("back-off is capped at 6 h", () => {
    const lastFixAt = now - 30 * H;
    const recoveries = [1, 2, 3, 4, 5].map((i) => rec(now - 6 * H - i * MIN, { lastFixAt }));
    expect(decide({ ...base, lastFixAt, recoveries }).action).toBe("restart");
  });

  test("never acts twice within a few minutes", () => {
    const r = rec(now - MIN_RECOVERY_GAP_MS + MIN, { reason: "not_running", action: "start" });
    expect(decide({ ...base, running: false, recoveries: [r] }).action).toBe("none");
    const old = rec(now - MIN_RECOVERY_GAP_MS - MIN, { reason: "not_running", action: "start" });
    expect(decide({ ...base, running: false, recoveries: [old] }).action).toBe("start");
  });

  test("caps recoveries per day", () => {
    const recoveries = Array.from({ length: MAX_RECOVERIES_PER_DAY }, (_, i) =>
      rec(now - (i + 1) * H, { reason: "not_running", action: "start" }),
    );
    expect(decide({ ...base, running: false, recoveries }).why).toBe("too many recoveries today");
    // Older than a day: doesn't count.
    const old = recoveries.map((r) => ({ ...r, at: r.at - 24 * H }));
    expect(decide({ ...base, running: false, recoveries: old }).action).toBe("start");
  });
});

describe("recoveries in the kv store", () => {
  test("parse drops malformed entries and sorts newest first", () => {
    const json = JSON.stringify([
      rec(1),
      { at: "x", reason: "stale_active", action: "start" },
      { at: 3, reason: "bogus", action: "start" },
      rec(5, { reason: "not_running", action: "start", ok: false, error: "boom" }),
      null,
    ]);
    const list = parseRecoveries(json);
    expect(list.map((r) => r.at)).toEqual([5, 1]);
    expect(list[0]).toMatchObject({ ok: false, error: "boom" });
    expect(parseRecoveries("not json")).toEqual([]);
    expect(parseRecoveries(null)).toEqual([]);
    expect(parseRecoveries('{"a":1}')).toEqual([]);
  });

  test("addRecovery keeps the newest few", () => {
    let list: Recovery[] = [];
    for (let i = 0; i < KEEP_RECOVERIES + 5; i++) list = addRecovery(list, rec(i));
    expect(list).toHaveLength(KEEP_RECOVERIES);
    expect(list[0].at).toBe(KEEP_RECOVERIES + 4);
  });

  test("describeRecovery", () => {
    const t = () => "14:02";
    expect(describeRecovery(rec(now, { reason: "not_running", action: "start" }), t)).toBe(
      "Restarted recording at 14:02 — updates had stopped",
    );
    expect(describeRecovery(rec(now, { reason: "stale_moving", lastFixAt: now - 25 * MIN }), t)).toBe(
      "Re-registered location updates at 14:02 — no location for 25 min while moving",
    );
    expect(describeRecovery(rec(now, { ok: false, error: "denied", lastFixAt: now - 3 * H }), t)).toBe(
      "Couldn't restart recording at 14:02 — no location for 3 h (denied)",
    );
  });
});

describe("heartbeat", () => {
  const hb = {
    now,
    enabled: true,
    running: true,
    permitted: true,
    mode: "standby" as const,
    lastFixAt: Date.UTC(2026, 9, 19, 11, 33),
    queued: 12.4,
    appVersion: "1.0.0 (1)",
    recoveries: [rec(now - H), rec(now - 30 * H)],
  };

  test("reports mode, last fix, recoveries in the last day", () => {
    expect(buildHeartbeat(hb)).toEqual({
      recording: true,
      mode: "standby",
      lastFixAt: "2026-10-19T11:33:00.000Z",
      queued: 12,
      appVersion: "1.0.0 (1)",
      recoveries: 1,
      problem: null,
    });
  });

  test("preset and usage", () => {
    const custom = { accuracy: "highest" as const, distance: 10, time: 10_000 };
    expect(buildHeartbeat({ ...hb, preset: { key: "precise", custom, smartTracking: true } })).toMatchObject({
      preset: "precise",
      custom: null,
      smartTracking: true,
    });
    expect(buildHeartbeat({ ...hb, preset: { key: "custom", custom, smartTracking: false } })).toMatchObject({
      preset: "custom",
      custom,
      smartTracking: false,
    });
    expect(buildHeartbeat({ ...hb, usage: [] }).usage).toEqual([]);
    expect("preset" in buildHeartbeat(hb)).toBe(false);
  });

  test("off and problems", () => {
    expect(buildHeartbeat({ ...hb, enabled: false })).toMatchObject({ recording: false, mode: "off", problem: null });
    expect(buildHeartbeat({ ...hb, permitted: false })).toMatchObject({ problem: "permission" });
    expect(buildHeartbeat({ ...hb, running: false })).toMatchObject({ problem: "not_running" });
    expect(buildHeartbeat({ ...hb, lastFixAt: null }).lastFixAt).toBeNull();
  });

  test("throttle", () => {
    expect(heartbeatDue(null, now, false)).toBe(true);
    expect(heartbeatDue(now - HEARTBEAT_EVERY_MS + 1, now, false)).toBe(false);
    expect(heartbeatDue(now - HEARTBEAT_EVERY_MS + 1, now, true)).toBe(true);
    expect(heartbeatDue(now - HEARTBEAT_EVERY_MS, now, false)).toBe(true);
  });
});
