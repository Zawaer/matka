import { describe, expect, it } from "vitest";
import { stripModes, type StripMode } from "./daySummary";

const m = (mode: StripMode["mode"], distance: number, duration = 60): StripMode => ({
  mode,
  distance,
  duration,
  count: 1,
});

describe("stripModes", () => {
  it("sorts by distance, then time, and drops empty modes", () => {
    const { visible, hidden } = stripModes({
      modes: [m("walking", 1200), m("bus", 0, 0), m("driving", 19000), m("cycling", 1200, 600), m("stationary", 0, 900)],
    });
    expect(visible.map((x) => x.mode)).toEqual(["driving", "cycling", "walking"]);
    expect(hidden).toEqual([]);
  });

  it("folds the rest into +N past the limit", () => {
    const modes = [m("walking", 1), m("bus", 2), m("tram", 3), m("metro", 4), m("train", 5), m("boat", 6)];
    const { visible, hidden } = stripModes({ modes });
    expect(visible.map((x) => x.mode)).toEqual(["boat", "train", "metro", "tram"]);
    expect(hidden.map((x) => x.mode)).toEqual(["bus", "walking"]);
  });

  it("shows a fifth chip rather than +1", () => {
    const modes = [m("walking", 1), m("bus", 2), m("tram", 3), m("metro", 4), m("train", 5)];
    expect(stripModes({ modes }).visible).toHaveLength(5);
    expect(stripModes({ modes }).hidden).toHaveLength(0);
  });

  it("handles no summary", () => {
    expect(stripModes(null)).toEqual({ visible: [], hidden: [] });
  });
});
