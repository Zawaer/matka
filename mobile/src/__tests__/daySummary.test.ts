import { parseDaySummary, stripModes, type ModeTotal } from "../daySummary";

const m = (mode: ModeTotal["mode"], distance: number, duration = 60): ModeTotal => ({ mode, distance, duration, count: 1 });

test("stripModes sorts by distance then time and drops empty modes", () => {
  const modes = [m("walking", 1200), m("bus", 0, 0), m("driving", 19000), m("cycling", 1200, 600), m("stationary", 0, 900)];
  expect(stripModes({ modes }).map((x) => x.mode)).toEqual(["driving", "cycling", "walking"]);
  expect(stripModes(null)).toEqual([]);
});

test("parseDaySummary", () => {
  expect(parseDaySummary(null)).toBeNull();
  expect(parseDaySummary({ date: "2026-10-18" })).toBeNull();
  expect(
    parseDaySummary({
      date: "2026-10-18",
      distance: 20000,
      duration: 3000,
      modes: [{ mode: "driving", distance: 19000, duration: 1500, count: 2 }, { mode: "hovercraft", distance: 1000 }, "x"],
    }),
  ).toEqual({
    date: "2026-10-18",
    distance: 20000,
    duration: 3000,
    modes: [
      { mode: "driving", distance: 19000, duration: 1500, count: 2 },
      { mode: "unknown", distance: 1000, duration: 0, count: 0 },
    ],
  });
});
