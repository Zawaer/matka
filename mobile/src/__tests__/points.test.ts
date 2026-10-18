import { usableActivity } from "../../modules/matka-activity";
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
      activity: null,
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

describe("motion activity", () => {
  it("rides along on the queue row and the wire, only when known", () => {
    const fix = { timestamp: 1760781600000, coords: { latitude: 60.17, longitude: 24.94, accuracy: 8 } };
    expect(fixToPoint(fix, 80, "on_bicycle")?.activity).toBe("on_bicycle");
    expect(fixToPoint(fix, 80)?.activity).toBeNull();
    expect(toWire(fixToPoint(fix, 80, "in_vehicle")!).activity).toBe("in_vehicle");
    expect("activity" in toWire(fixToPoint(fix, 80)!)).toBe(false);
  });

  it("uses a reading only if it's confident and close to the fix", () => {
    const at = 1760781600000;
    expect(usableActivity({ type: "on_bicycle", confidence: 70, at }, at + 60_000)).toBe("on_bicycle");
    // Deferred batch: the reading came after the fix.
    expect(usableActivity({ type: "in_vehicle", confidence: 70, at: at + 120_000 }, at)).toBe("in_vehicle");
    expect(usableActivity({ type: "on_bicycle", confidence: 30, at }, at)).toBeNull();
    expect(usableActivity({ type: "on_bicycle", confidence: 90, at }, at + 4 * 60_000)).toBeNull();
    expect(usableActivity({ type: "tilting", confidence: 90, at }, at)).toBeNull();
    expect(usableActivity(null, at)).toBeNull();
  });
});

