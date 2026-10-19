import { describe, expect, it } from "vitest";
import { detect, type DPoint } from "./detect";
import { SavedIndex } from "./saved";

// Espoo-ish. 0.001° lat ≈ 111 m.
const CAMPUS = { lat: 60.1866, lon: 24.8213 };
const T0 = 1_760_000_000;

const at = (ts: number, lat: number, lon: number): DPoint => ({ ts, lat, lon, accuracy: 10, speed: null });

function dwell(start: number, secs: number, spot: { lat: number; lon: number }, step = 60) {
  const out: DPoint[] = [];
  for (let t = 0; t <= secs; t += step) out.push(at(start + t, spot.lat, spot.lon));
  return out;
}

/** Walk from a to b at 1.4 m/s, a fix every 30 s; returns the fixes and arrival time. */
function walk(start: number, a: { lat: number; lon: number }, b: { lat: number; lon: number }, metres: number) {
  const secs = metres / 1.4;
  const pts: DPoint[] = [];
  for (let t = 30; t < secs; t += 30) {
    const f = t / secs;
    pts.push(at(start + t, a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f));
  }
  return { pts, end: Math.ceil(start + secs) };
}

const kinds = (o: ReturnType<typeof detect>) => o.map((x) => x.kind);

describe("SavedIndex", () => {
  const idx = new SavedIndex([
    { id: "campus", lat: CAMPUS.lat, lon: CAMPUS.lon, radius: 500 },
    // A small saved café inside the campus, 200 m north.
    { id: "cafe", lat: CAMPUS.lat + 0.0018, lon: CAMPUS.lon, radius: 100 },
  ]);

  it("finds the saved place a centre lies inside", () => {
    expect(idx.at(CAMPUS.lat + 0.003, CAMPUS.lon)?.id).toBe("campus"); // ~330 m
    expect(idx.at(CAMPUS.lat + 0.006, CAMPUS.lon)).toBeNull(); // ~670 m
  });

  it("prefers the place it is deepest inside (distance minus radius)", () => {
    // At the café: 0 - 100 = -100 vs 200 - 500 = -300: the campus is deeper.
    expect(idx.at(CAMPUS.lat + 0.0018, CAMPUS.lon)?.id).toBe("campus");
    // Near the edge of a big saved area, a small saved home wins on its doorstep.
    const homes = new SavedIndex([
      { id: "district", lat: 60, lon: 25, radius: 1000 },
      { id: "home", lat: 60.0085, lon: 25, radius: 100 }, // ~950 m from the district centre
    ]);
    expect(homes.at(60.0085, 25)?.id).toBe("home"); // -100 vs 950 - 1000 = -50
    expect(homes.at(60.0075, 25)?.id).toBe("district"); // 111 m from home: outside it
  });
});

describe("merging stays inside a saved place", () => {
  // Lecture in one building, a 330 m walk, lab in another.
  const B = { lat: CAMPUS.lat + 0.003, lon: CAMPUS.lon };
  const lecture = dwell(T0, 2 * 3600, CAMPUS);
  const w = walk(T0 + 2 * 3600, CAMPUS, B, 330);
  const lab = dwell(w.end, 3 * 3600, B);
  const pts = [...lecture, ...w.pts, ...lab];

  it("keeps two stays and the walk without saved places", () => {
    expect(kinds(detect(pts))).toEqual(["stay", "trip", "stay"]);
  });

  it("is one visit when both are inside the same saved place", () => {
    const idx = new SavedIndex([{ id: "campus", lat: CAMPUS.lat, lon: CAMPUS.lon, radius: 500 }]);
    const out = detect(pts, { savedPlaceAt: (lat, lon) => idx.at(lat, lon)?.id ?? null });
    expect(kinds(out)).toEqual(["stay"]);
    const s = out[0];
    if (s.kind !== "stay") throw 0;
    expect(s.stay.start).toBe(T0);
    expect(s.stay.end).toBe(w.end + 3 * 3600);
    // The merged centre is still inside the campus, so it snaps there.
    expect(idx.at(s.stay.lat, s.stay.lon)?.id).toBe("campus");
  });

  it("doesn't merge when the second stay is outside the radius", () => {
    const idx = new SavedIndex([{ id: "campus", lat: CAMPUS.lat, lon: CAMPUS.lon, radius: 250 }]);
    const out = detect(pts, { savedPlaceAt: (lat, lon) => idx.at(lat, lon)?.id ?? null });
    expect(kinds(out)).toEqual(["stay", "trip", "stay"]);
  });

  it("doesn't merge across a gap of 20 minutes or more", () => {
    const idx = new SavedIndex([{ id: "campus", lat: CAMPUS.lat, lon: CAMPUS.lon, radius: 500 }]);
    // A 25-minute errand off campus (1.5 km out and back) between the buildings.
    const slow: DPoint[] = [];
    for (let t = 60; t < 1500; t += 60) {
      const f = t / 1500;
      slow.push(at(T0 + 2 * 3600 + t, CAMPUS.lat + 0.0135 * (1 - Math.abs(2 * f - 1)) + 0.003 * f, CAMPUS.lon));
    }
    const lab2 = dwell(T0 + 2 * 3600 + 1500, 3600, B);
    const out = detect([...lecture, ...slow, ...lab2], { savedPlaceAt: (lat, lon) => idx.at(lat, lon)?.id ?? null });
    expect(kinds(out).filter((k) => k === "stay")).toHaveLength(2);
  });
});
