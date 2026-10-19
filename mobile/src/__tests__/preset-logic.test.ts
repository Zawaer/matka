import { DEFAULT_CUSTOM, customDeferral, describeCustom, parseCustom, serializeCustom } from "../preset-logic";

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

test("deferral and description", () => {
  expect(customDeferral({ accuracy: "high", distance: 5, time: 2000 })).toEqual({ interval: 8000, distance: 20 });
  expect(customDeferral({ accuracy: "high", distance: 100, time: 120_000 })).toEqual({ interval: 120_000, distance: 100 });
  expect(describeCustom({ accuracy: "balanced", distance: 100, time: 120_000 })).toBe("Wi-Fi/cell positioning, a point every ≥2 min / 100 m.");
  expect(describeCustom({ accuracy: "highest", distance: 5, time: 2000 })).toBe("Best GPS, a point every ≥2 s / 5 m.");
});
