import { describe, expect, it } from "vitest";
import { SKETCH_H, SKETCH_W, projectSketch } from "./routeSketch";

const nums = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe("projectSketch", () => {
  it("is null with nothing to draw", () => {
    expect(projectSketch([])).toBeNull();
    expect(projectSketch([{ mode: "walking", points: [[24, 60]] }])).toBeNull();
  });

  it("fits the lines inside the box with a margin, keeping the aspect ratio", () => {
    const s = projectSketch(
      [
        { mode: "flying", points: [[24.96, 60.32], [13.5, 52.37]] },
        { mode: "train", points: [[13.5, 52.37], [13.4, 52.52]] },
      ],
      [{ lat: 52.52, lon: 13.4 }],
    )!;
    expect(s.paths.map((p) => p.mode)).toEqual(["flying", "train"]);
    const all = s.paths.flatMap((p) => nums(p.d));
    const xs = all.filter((_, i) => i % 2 === 0);
    const ys = all.filter((_, i) => i % 2 === 1);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(SKETCH_W);
    }
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(SKETCH_H);
    }
    // Helsinki is north-east of Berlin: right of it and above it.
    expect(xs[0]).toBeGreaterThan(xs[1]);
    expect(ys[0]).toBeLessThan(ys[1]);
    // The tall extent fills the height (minus margins), centred horizontally.
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(SKETCH_H * 0.54, 0);
    // …in the band above the title scrim (8 %–62 % of the height).
    expect(Math.max(...ys)).toBeLessThanOrEqual(SKETCH_H * 0.62 + 0.5);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(SKETCH_W / 2, 0);
    expect(s.stops).toHaveLength(1);
  });
});
