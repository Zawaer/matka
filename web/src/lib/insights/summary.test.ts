import { describe, expect, it } from "vitest";
import { clip, daySummary, monthModes, summarize, type Move } from "./summary";

const TZ = "Europe/Helsinki";
const at = (iso: string) => Date.parse(iso);
const move = (from: string, to: string, km: number, mode: string): Move => ({
  start: at(from),
  end: at(to),
  distance: km * 1000,
  mode,
});

describe("summary", () => {
  it("clips a move by its share of time", () => {
    const m = move("2026-10-03T20:00:00Z", "2026-10-03T22:00:00Z", 100, "train");
    expect(clip(m, at("2026-10-03T21:00:00Z"), at("2026-10-04T21:00:00Z"))).toEqual({
      distance: 50_000,
      duration: 3600,
    });
    expect(clip(m, at("2026-10-04T00:00:00Z"), at("2026-10-05T00:00:00Z"))).toBeNull();
  });

  it("sums per mode, largest first, skipping stationary", () => {
    const s = summarize(
      [
        move("2026-10-03T08:00:00Z", "2026-10-03T08:30:00Z", 2, "walking"),
        move("2026-10-03T09:00:00Z", "2026-10-03T10:00:00Z", 60, "driving"),
        move("2026-10-03T11:00:00Z", "2026-10-03T11:10:00Z", 1, "walking"),
        move("2026-10-03T12:00:00Z", "2026-10-03T13:00:00Z", 0, "stationary"),
        move("2026-10-03T14:00:00Z", "2026-10-03T14:10:00Z", 1, "hovercraft"),
      ],
      at("2026-10-02T21:00:00Z"),
      at("2026-10-03T21:00:00Z"),
    );
    expect(s.modes.map((m) => [m.mode, m.distance, m.duration, m.count])).toEqual([
      ["driving", 60_000, 3600, 1],
      ["walking", 3000, 2400, 2],
      ["unknown", 1000, 600, 1],
    ]);
    expect(s.distance).toBe(64_000);
    expect(s.duration).toBe(6600);
  });

  it("splits a night train between two local days", () => {
    const moves = [move("2026-10-03T20:00:00Z", "2026-10-03T23:00:00Z", 300, "train")];
    // Local midnight is 21:00Z: one third on the 3rd, two thirds on the 4th.
    expect(daySummary(moves, "2026-10-03", TZ).distance).toBe(100_000);
    expect(daySummary(moves, "2026-10-04", TZ).distance).toBe(200_000);
  });

  it("builds a month with six months of history per mode", () => {
    const moves = [
      move("2026-05-10T10:00:00Z", "2026-05-10T11:00:00Z", 20, "cycling"),
      move("2026-09-30T21:30:00Z", "2026-09-30T22:00:00Z", 5, "bus"), // 1 Oct local
      move("2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z", 10, "cycling"),
    ];
    const m = monthModes(moves, "2026-10", TZ);
    expect(m.historyMonths).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(m.modes.map((x) => x.mode)).toEqual(["cycling", "bus"]);
    const cycling = m.modes[0];
    expect(cycling.distance).toBe(10_000);
    expect(cycling.history.map((h) => h.distance)).toEqual([20_000, 0, 0, 0, 0, 10_000]);
    expect(m.distance).toBe(15_000);
    expect(m.firstMonth).toBe("2026-05");
    expect(m.lastMonth).toBe("2026-10");
  });
});
