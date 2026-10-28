import { daySketch, fitView, mercator, svgPath } from "../day-sketch";
import type { TimelineItem } from "../viewer";

const visit = (id: number, placeId: number, lat: number | null, lon: number | null): TimelineItem => ({
  kind: "visit",
  visit: { id, startedAt: "2026-10-27T06:00:00Z", endedAt: "2026-10-27T07:00:00Z", duration: 3600, placeId, placeName: "A", category: null, lat, lon },
});
const move = (id: number, extra: Partial<Extract<TimelineItem, { kind: "move" }>["track"]>): TimelineItem => ({
  kind: "move",
  track: { id, startedAt: "2026-10-27T07:00:00Z", endedAt: "2026-10-27T07:30:00Z", distance: 1000, duration: 1800, mode: "cycling", legs: [], waits: [], ...extra },
});

describe("mercator", () => {
  it("puts (0, 0) in the middle of the unit world, north up", () => {
    expect(mercator({ lat: 0, lon: 0 })).toEqual({ x: 0.5, y: 0.5 });
    expect(mercator({ lat: 60, lon: 0 }).y).toBeLessThan(0.5);
    expect(mercator({ lat: 90, lon: 180 }).y).toBeCloseTo(0, 6); // clamped, finite
  });
});

describe("fitView", () => {
  it("frames the points inside the web map's padding, the box centred between them", () => {
    const pts = [
      { lat: 60.16, lon: 24.73 },
      { lat: 60.19, lon: 24.83 },
    ];
    const p = fitView(pts, 412, 300)!;
    const a = p(pts[0]);
    const b = p(pts[1]);
    // West to east, south to north (y grows down).
    expect(a.x).toBeLessThan(b.x);
    expect(a.y).toBeGreaterThan(b.y);
    // One axis touches its padding (left 28 / right 32, or top 40 / bottom 32), nothing spills over.
    const touchesX = Math.abs(a.x - 28) < 0.01 && Math.abs(b.x - (412 - 32)) < 0.01;
    const touchesY = Math.abs(b.y - 40) < 0.01 && Math.abs(a.y - (300 - 32)) < 0.01;
    expect(touchesX || touchesY).toBe(true);
    for (const q of [a, b]) {
      expect(q.x).toBeGreaterThanOrEqual(27.99);
      expect(q.x).toBeLessThanOrEqual(380.01);
      expect(q.y).toBeGreaterThanOrEqual(39.99);
      expect(q.y).toBeLessThanOrEqual(268.01);
    }
  });

  it("shows a single point in the middle, and nothing without points or room", () => {
    const p = fitView([{ lat: 60.16, lon: 24.73 }], 400, 300)!;
    expect(p({ lat: 60.16, lon: 24.73 })).toEqual({ x: 200, y: 150 });
    expect(fitView([], 400, 300)).toBeNull();
    expect(fitView([{ lat: 1, lon: 1 }], 0, 300)).toBeNull();
  });

  it("stops zooming in at 16 for points a few metres apart", () => {
    const p = fitView([{ lat: 60.16, lon: 24.73 }, { lat: 60.16001, lon: 24.73001 }], 412, 300)!;
    const a = p({ lat: 60.16, lon: 24.73 });
    const b = p({ lat: 60.16001, lon: 24.73001 });
    // 0.00001° of longitude is under a pixel at z16 (512 px tiles); unclamped it would fill the view.
    expect(Math.abs(b.x - a.x)).toBeLessThan(1);
  });
});

describe("daySketch", () => {
  it("draws moves by their path, else start to end; skips lying still and repeats of a place", () => {
    const s = daySketch(
      [
        visit(1, 10, 60.16, 24.73),
        move(2, { path: [{ lat: 60.16, lon: 24.73 }, { lat: 60.17, lon: 24.78 }, { lat: 60.19, lon: 24.83 }] }),
        visit(3, 11, 60.19, 24.83),
        move(4, { mode: "stationary", from: { lat: 60.19, lon: 24.83 }, to: { lat: 60.19, lon: 24.84 } }),
        move(5, { mode: "walking", from: { lat: 60.19, lon: 24.83 }, to: { lat: 60.16, lon: 24.73 } }),
        visit(6, 10, 60.16, 24.73),
        visit(7, 12, null, null),
      ],
      412,
      300,
    )!;
    expect(s.lines.map((l) => [l.key, l.points.length])).toEqual([
      ["m-2", 3],
      ["m-5", 2],
    ]);
    expect(s.stops.map((x) => x.key)).toEqual(["v-1", "v-3"]);
  });

  it("draws an added trip straight, even with a path", () => {
    const s = daySketch([move(9, { added: true, from: { lat: 60, lon: 24 }, to: { lat: 61, lon: 25 }, path: [{ lat: 60, lon: 24 }, { lat: 60.5, lon: 26 }, { lat: 61, lon: 25 }] })], 412, 300)!;
    expect(s.lines[0]).toMatchObject({ added: true });
    expect(s.lines[0].points).toHaveLength(2);
  });

  it("has nothing to draw for a day without positions", () => {
    expect(daySketch([visit(1, 1, null, null)], 412, 300)).toBeNull();
    expect(daySketch([], 412, 300)).toBeNull();
  });
});

describe("svgPath", () => {
  it("moves then draws lines, rounded", () => {
    expect(svgPath([{ x: 1.04, y: 2 }, { x: 3, y: 4.26 }])).toBe("M1 2 L3 4.3");
  });
});
