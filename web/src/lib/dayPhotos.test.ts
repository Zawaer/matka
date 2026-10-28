import { describe, expect, it } from "vitest";
import type { ImmichAsset } from "./covers";
import { dayPhotosHash, groupDayPhotos, photoRanges } from "./dayPhotos";

const T0 = Date.parse("2026-10-27T08:00:00Z");
const M = 60_000;
const photo = (id: string, min: number, over: Partial<NonNullable<ImmichAsset["exifInfo"]>> = {}, type = "IMAGE"): ImmichAsset => ({
  id,
  type,
  fileCreatedAt: new Date(T0 + min * M).toISOString(),
  exifInfo: { make: "Google", ...over },
});
// Home 8:00–9:00 (60.18, 24.83), walk 9:00–9:30, school 9:30–12:00 (60.19, 24.83).
const items = [
  { key: "v-1", start: T0, end: T0 + 60 * M, lat: 60.18, lon: 24.83 },
  { key: "m-7", start: T0 + 60 * M, end: T0 + 90 * M },
  { key: "v-2", start: T0 + 90 * M, end: T0 + 240 * M, lat: 60.19, lon: 24.83 },
];

describe("groupDayPhotos", () => {
  it("sorts camera photos into the item they were taken in, oldest first", () => {
    const out = groupDayPhotos(
      [photo("b", 20), photo("a", 10), photo("walk", 70), photo("school", 100, { latitude: 60.1901, longitude: 24.8302 })],
      items,
    );
    expect(out.items).toEqual([
      { key: "v-1", ids: ["a", "b"], total: 2 },
      { key: "m-7", ids: ["walk"], total: 1 },
      { key: "v-2", ids: ["school"], total: 1 },
    ]);
    expect(out.points).toEqual([{ id: "school", key: "v-2", lat: 60.1901, lon: 24.8302 }]);
  });
  it("drops screenshots, videos, photos outside the day's items and far from a visit's place", () => {
    const out = groupDayPhotos(
      [
        { id: "shot", type: "IMAGE", fileCreatedAt: new Date(T0 + 5 * M).toISOString(), exifInfo: { make: null } },
        photo("video", 5, {}, "VIDEO"),
        photo("night", -120),
        photo("elsewhere", 30, { latitude: 60.3, longitude: 24.9 }),
      ],
      items,
    );
    expect(out.items).toEqual([]);
  });
  it("keeps every photo in the total but only so many ids", () => {
    const many = Array.from({ length: 70 }, (_, i) => photo(`p${String(i).padStart(2, "0")}`, 100 + i));
    const [school] = groupDayPhotos(many, items).items;
    expect(school.total).toBe(70);
    expect(school.ids).toHaveLength(60);
    expect(school.ids[0]).toBe("p00");
  });
});

describe("photoRanges", () => {
  it("merges close windows and caps the number of searches", () => {
    expect(photoRanges(items)).toEqual([{ start: T0, end: T0 + 240 * M }]);
    const scattered = Array.from({ length: 20 }, (_, i) => ({ key: `v-${i}`, start: T0 + i * 60 * M, end: T0 + i * 60 * M + 10 * M }));
    const r = photoRanges(scattered, 8);
    expect(r).toHaveLength(8);
    expect(r[0].start).toBe(T0);
    expect(r[7].end).toBe(T0 + 19 * 60 * M + 10 * M);
  });
});

describe("dayPhotosHash", () => {
  it("changes with the items and the server", () => {
    const h = dayPhotosHash("http://immich:2283", items);
    expect(dayPhotosHash("http://immich:2283", items)).toBe(h);
    expect(dayPhotosHash("http://other:2283", items)).not.toBe(h);
    expect(dayPhotosHash("http://immich:2283", items.slice(1))).not.toBe(h);
  });
});
