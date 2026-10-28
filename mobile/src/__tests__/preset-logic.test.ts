import { DEFAULT_CUSTOM, customDeferral, parseCustom, presetSpecLines, serializeCustom } from "../preset-logic";

test("parseCustom falls back per field", () => {
  expect(parseCustom(null)).toEqual(DEFAULT_CUSTOM);
  expect(parseCustom("{bad")).toEqual(DEFAULT_CUSTOM);
  expect(parseCustom("[]")).toEqual(DEFAULT_CUSTOM);
  expect(parseCustom(JSON.stringify({ accuracy: "highest", distance: 5, time: 2000 }))).toEqual({
    accuracy: "highest",
    distance: 5,
    time: 2000,
  });
  expect(parseCustom(JSON.stringify({ accuracy: "gps", distance: 7, time: "30000" }))).toEqual(DEFAULT_CUSTOM);
  expect(parseCustom(JSON.stringify({ distance: 100 }))).toEqual({ ...DEFAULT_CUSTOM, distance: 100 });
});

test("round trip", () => {
  const c = { accuracy: "balanced" as const, distance: 50, time: 60_000 };
  expect(parseCustom(serializeCustom(c))).toEqual(c);
});

test("deferral", () => {
  expect(customDeferral({ accuracy: "high", distance: 5, time: 2000 })).toEqual({ interval: 8000, distance: 20 });
  expect(customDeferral({ accuracy: "high", distance: 100, time: 120_000 })).toEqual({ interval: 120_000, distance: 100 });
});

test("spec lines: accuracy class, cadence while moving, what happens while still", () => {
  // Balanced preset, Smart Tracking on.
  expect(presetSpecLines({ accuracy: "high", distance: 25, time: 30_000 }, true)).toEqual([
    "GPS · typically 5–15 m outdoors",
    "Moving: a point every 30 s, at least 25 m apart",
    "Still: GPS rests, Wi-Fi/cell standby",
  ]);
  // Low power: no Smart Tracking, no "outdoors" (Wi-Fi/cell isn't sky-dependent).
  expect(presetSpecLines({ accuracy: "balanced", distance: 100, time: 120_000 }, false)).toEqual([
    "Wi-Fi/cell · typically 50–500 m",
    "Moving: a point every 2 min, at least 100 m apart",
    "Still: stays on Wi-Fi/cell",
  ]);
  // Max detail, Smart Tracking off.
  expect(presetSpecLines({ accuracy: "highest", distance: 5, time: 2000 }, false)).toEqual([
    "Best GPS · typically 3–10 m outdoors",
    "Moving: a point every 2 s, at least 5 m apart",
    "Still: GPS stays on",
  ]);
  expect(presetSpecLines({ accuracy: "high", distance: 0, time: 10_000 }, true)[1]).toBe("Moving: a point every 10 s");
});
