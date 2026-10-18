import { batteryPercent, fixToPoint, toEpochMs, toEpochSeconds, toWire } from "../points";

describe("timestamps", () => {
  it("keeps epoch ms and converts epoch seconds to ms", () => {
    expect(toEpochMs(1760781600123)).toBe(1760781600123);
    expect(toEpochMs(1760781600)).toBe(1760781600000);
    expect(toEpochMs(1760781600.5)).toBe(1760781600500);
  });
  it("rejects non-finite or non-positive", () => {
    expect(toEpochMs(NaN)).toBeNull();
    expect(toEpochMs(0)).toBeNull();
    expect(toEpochMs(-5)).toBeNull();
    expect(toEpochMs(Infinity)).toBeNull();
  });
  it("floors ms to integer seconds", () => {
    expect(toEpochSeconds(1760781600999)).toBe(1760781600);
    expect(toEpochSeconds(1760781600000)).toBe(1760781600);
  });
});

describe("batteryPercent", () => {
  it("maps 0..1 to percent and unknown to null", () => {
    expect(batteryPercent(0.759999)).toBe(76);
    expect(batteryPercent(1)).toBe(100);
    expect(batteryPercent(0)).toBe(0);
    expect(batteryPercent(-1)).toBeNull();
    expect(batteryPercent(null)).toBeNull();
    expect(batteryPercent(NaN)).toBeNull();
  });
});

describe("fixToPoint / toWire", () => {
  const fix = {
    timestamp: 1760781600123,
    coords: { latitude: 60.1699, longitude: 24.9384, accuracy: 12.53, altitude: 14.24, speed: 1.33 },
  };

  it("converts a full fix", () => {
    const p = fixToPoint(fix, 87)!;
    expect(p).toEqual({
      ts: 1760781600123,
      lat: 60.1699,
      lon: 24.9384,
      accuracy: 12.53,
      altitude: 14.24,
      speed: 1.33,
      battery: 87,
    });
    expect(toWire(p)).toEqual({
      lat: 60.1699,
      lon: 24.9384,
      ts: 1760781600,
      accuracy: 12.5,
      altitude: 14.2,
      speed: 1.3,
      battery: 87,
    });
  });

  it("omits unknown optional fields (negative speed = unknown)", () => {
    const p = fixToPoint({
      timestamp: fix.timestamp,
      coords: { latitude: 1, longitude: 2, accuracy: null, altitude: null, speed: -1 },
    })!;
    expect(toWire(p)).toEqual({ lat: 1, lon: 2, ts: 1760781600 });
  });

  it("drops fixes with invalid coordinates or timestamp", () => {
    expect(fixToPoint({ ...fix, coords: { ...fix.coords, latitude: 91 } })).toBeNull();
    expect(fixToPoint({ ...fix, coords: { ...fix.coords, longitude: -181 } })).toBeNull();
    expect(fixToPoint({ ...fix, coords: { ...fix.coords, latitude: NaN } })).toBeNull();
    expect(fixToPoint({ ...fix, timestamp: NaN })).toBeNull();
  });
});
