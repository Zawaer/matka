import { describe, expect, it } from "vitest";
import { NO_CONTACT_WARN_MS, deviceHealth, parseHeartbeat, parseUsage, span, statusPreset } from "./heartbeat";

const NOW = Date.UTC(2026, 9, 19, 20, 0);
const MIN = 60_000;
const H = 60 * MIN;
const ago = (ms: number) => new Date(NOW - ms);

const good = {
  recording: true,
  mode: "active",
  lastFixAt: new Date(NOW - 12 * MIN).toISOString(),
  queued: 40,
  appVersion: "1.0.0 (1)",
  recoveries: 0,
  problem: null,
};

describe("parseHeartbeat", () => {
  it("accepts a full heartbeat", () => {
    const r = parseHeartbeat(good, NOW);
    expect(r).toEqual({ ok: true, status: { ...good, preset: null, custom: null, smartTracking: null }, usage: [] });
  });

  it("reads the recording preset", () => {
    const r = parseHeartbeat({ ...good, preset: "precise", smartTracking: true }, NOW);
    expect(r.ok && r.status).toMatchObject({ preset: "precise", custom: null, smartTracking: true });
    expect(r.ok && statusPreset(r.status)).toEqual({ preset: "precise", custom: null, smartTracking: true });
    const c = parseHeartbeat(
      { ...good, preset: "custom", custom: { accuracy: "highest", distance: 10, time: 10_000 }, smartTracking: false },
      NOW,
    );
    expect(c.ok && c.status).toMatchObject({
      preset: "custom",
      custom: { accuracy: "highest", distance: 10, time: 10_000 },
      smartTracking: false,
    });
    // Unknown presets, bad custom values and a non-boolean flag are dropped, not rejected.
    const bad = parseHeartbeat({ ...good, preset: "turbo", custom: { accuracy: "x" }, smartTracking: "yes" }, NOW);
    expect(bad.ok && bad.status).toMatchObject({ preset: null, custom: null, smartTracking: null });
    expect(bad.ok && statusPreset(bad.status)).toBeNull();
    const badCustom = parseHeartbeat({ ...good, preset: "custom", custom: { accuracy: "high", distance: -1, time: 1 } }, NOW);
    expect(badCustom.ok && badCustom.status).toMatchObject({ preset: "custom", custom: null });
  });

  it("requires recording and mode", () => {
    expect(parseHeartbeat(null, NOW).ok).toBe(false);
    expect(parseHeartbeat([], NOW).ok).toBe(false);
    expect(parseHeartbeat({ ...good, recording: "yes" }, NOW).ok).toBe(false);
    expect(parseHeartbeat({ ...good, mode: "turbo" }, NOW).ok).toBe(false);
    expect(parseHeartbeat({ recording: false }, NOW).ok).toBe(false);
  });

  it("cleans optional fields", () => {
    const r = parseHeartbeat(
      {
        recording: true,
        mode: "standby",
        lastFixAt: "not a date",
        queued: -3,
        appVersion: "x".repeat(200),
        recoveries: 2.6,
        problem: "something else",
      },
      NOW,
    );
    expect(r.ok && r.status).toEqual({
      recording: true,
      mode: "standby",
      lastFixAt: null,
      queued: null,
      appVersion: "x".repeat(64),
      recoveries: 3,
      problem: null,
      preset: null,
      custom: null,
      smartTracking: null,
    });
  });

  it("accepts epoch ms for lastFixAt and normalises it", () => {
    const r = parseHeartbeat({ ...good, lastFixAt: NOW - 1500 }, NOW);
    expect(r.ok && r.status.lastFixAt).toBe(new Date(NOW - 2000).toISOString());
  });

  it("recording off forces mode off and drops the problem", () => {
    const r = parseHeartbeat({ ...good, recording: false, mode: "active", problem: "permission" }, NOW);
    expect(r.ok && r.status).toMatchObject({ mode: "off", problem: null });
  });
});

describe("parseUsage", () => {
  const row = {
    day: "2026-10-19",
    preset: "balanced",
    activeS: 1320.4,
    standbyS: 50_000,
    offS: 0,
    fixes: 210,
    movingS: 1500,
    stillS: 48_000,
    current: { active: { n: 12, mean: 412.34, median: 400 }, standby: { n: 30, mean: 61, median: 55 }, screen: { n: 0 } },
    dropMah: 1240.06,
    dropS: 34_000,
  };

  it("reads rows and cleans them", () => {
    const [u] = parseUsage([row], NOW);
    expect(u).toEqual({
      ...row,
      activeS: 1320,
      current: {
        active: { n: 12, mean: 412.3, median: 400 },
        standby: { n: 30, mean: 61, median: 55 },
        screen: { n: 0, mean: null, median: null },
      },
      dropMah: 1240.1,
    });
    expect(parseHeartbeat({ ...good, usage: [row] }, NOW).ok).toBe(true);
  });

  it("drops bad rows and duplicates, clamps values", () => {
    const out = parseUsage(
      [
        row,
        { ...row }, // duplicate day+preset
        { ...row, preset: "turbo" },
        { ...row, day: "2026-02-30" },
        { ...row, day: "2026-09-01" }, // too old
        { ...row, day: "2026-10-18", preset: "precise", activeS: -5, fixes: "x", standbyS: 1e9, current: null },
      ],
      NOW,
    );
    expect(out.map((u) => `${u.day} ${u.preset}`)).toEqual(["2026-10-19 balanced", "2026-10-18 precise"]);
    expect(out[1]).toMatchObject({ activeS: 0, fixes: 0, standbyS: 90_000, current: { active: { n: 0, mean: null } } });
    expect(parseUsage("nope", NOW)).toEqual([]);
  });
});

describe("deviceHealth", () => {
  const dev = (status: unknown, heartbeat = 5 * MIN, seen: number | null = 30 * MIN) => ({
    heartbeat_at: heartbeat == null ? null : ago(heartbeat),
    last_seen_at: seen == null ? null : ago(seen),
    status,
  });

  it("is null for apps that never sent a heartbeat", () => {
    expect(deviceHealth(dev(null), NOW)).toBeNull();
    expect(deviceHealth(dev({ junk: 1 }), NOW)).toBeNull();
  });

  it("recording normally", () => {
    expect(deviceHealth(dev(good), NOW)).toEqual({ tone: "ok", text: "Recording · last location 12 min ago" });
    expect(deviceHealth(dev({ ...good, mode: "standby", lastFixAt: null }), NOW)?.text).toBe(
      "Recording · no location yet · standby",
    );
  });

  it("mentions watchdog restarts", () => {
    expect(deviceHealth(dev({ ...good, recoveries: 2 }), NOW)).toEqual({
      tone: "warn",
      text: "Recording · last location 12 min ago · 2 restarts in 24 h",
    });
  });

  it("warns when a recording phone goes quiet", () => {
    expect(deviceHealth(dev(good, NO_CONTACT_WARN_MS - MIN, null), NOW)?.tone).toBe("ok");
    expect(deviceHealth(dev(good, 5 * H + 10 * MIN, 8 * H), NOW)).toEqual({
      tone: "bad",
      text: "No contact for 5 h while recording was on",
    });
    // An upload counts as contact.
    expect(deviceHealth(dev(good, 8 * H, 2 * MIN), NOW)?.tone).toBe("ok");
  });

  it("recording off", () => {
    expect(deviceHealth(dev({ ...good, recording: false, mode: "off" }, 2 * H, null), NOW)).toEqual({
      tone: "warn",
      text: "Recording is off on this phone · last contact 2 h ago",
    });
  });

  it("problems reported by the phone", () => {
    expect(deviceHealth(dev({ ...good, problem: "permission" }), NOW)?.text).toMatch(/permission is missing/);
    expect(deviceHealth(dev({ ...good, problem: "not_running" }), NOW)?.text).toMatch(/aren't running/);
  });
});

describe("span", () => {
  it("formats", () => {
    expect(span(30_000)).toBe("0 min");
    expect(span(45 * MIN)).toBe("45 min");
    expect(span(5 * H + 59 * MIN)).toBe("5 h");
    expect(span(50 * H)).toBe("2 d");
  });
});
