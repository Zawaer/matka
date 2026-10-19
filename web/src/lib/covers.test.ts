import { describe, expect, it } from "vitest";
import { type ImmichAsset, displaySize, inputHash, pickCover, rankCovers, searchRanges } from "./covers";

const H = 3_600_000;
const T0 = Date.parse("2026-06-01T08:00:00Z");
const win = { start: T0, end: T0 + 10 * H };

let n = 0;
function photo(over: Partial<ImmichAsset> & { at?: number; exif?: Partial<NonNullable<ImmichAsset["exifInfo"]>> } = {}): ImmichAsset {
  const { at = T0 + 5 * H, exif, ...rest } = over;
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    type: "IMAGE",
    isFavorite: false,
    fileCreatedAt: new Date(at).toISOString(),
    exifInfo: { make: "Apple", exifImageWidth: 4000, exifImageHeight: 3000, orientation: "1", ...exif },
    ...rest,
  };
}

const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("rankCovers", () => {
  it("drops photos without a camera make, videos and photos outside the windows", () => {
    const ok = photo();
    const screenshot = photo({ exif: { make: null } });
    const blank = photo({ exif: { make: "  " } });
    const video = photo({ type: "VIDEO" });
    const outside = photo({ at: T0 + 11 * H });
    expect(ids(rankCovers([screenshot, ok, blank, video, outside], [win]))).toEqual([ok.id]);
  });

  it("drops photos whose GPS is too far from the window's location, keeps those without GPS", () => {
    const w = { ...win, lat: 60.17, lon: 24.94 };
    const here = photo({ exif: { latitude: 60.171, longitude: 24.941 } });
    const far = photo({ exif: { latitude: 60.45, longitude: 22.27 } });
    const noGps = photo();
    const r = rankCovers([far, noGps, here], [w], 500);
    expect(ids(r)).toEqual([here.id, noGps.id]);
    expect(r[0].located).toBe(true);
    expect(r[1].located).toBe(false);
  });

  it("checks GPS against the window the photo was taken in", () => {
    const a = { start: T0, end: T0 + H, lat: 60.17, lon: 24.94 };
    const b = { start: T0 + 2 * H, end: T0 + 3 * H, lat: 60.45, lon: 22.27 };
    const atB = photo({ at: T0 + 2.5 * H, exif: { latitude: 60.45, longitude: 22.27 } });
    const atAButInB = photo({ at: T0 + 2.5 * H, exif: { latitude: 60.17, longitude: 24.94 } });
    expect(ids(rankCovers([atB, atAButInB], [a, b]))).toEqual([atB.id]);
  });

  it("prefers favourites, then landscape, then the middle of the window", () => {
    const edgeLandscape = photo({ at: T0 + 0.5 * H });
    const midLandscape = photo({ at: T0 + 5.2 * H });
    const midPortrait = photo({ at: T0 + 5 * H, exif: { exifImageWidth: 3000, exifImageHeight: 4000 } });
    const favPortrait = photo({ at: T0 + 9 * H, isFavorite: true, exif: { exifImageWidth: 3000, exifImageHeight: 4000 } });
    expect(ids(rankCovers([midPortrait, edgeLandscape, favPortrait, midLandscape], [win]))).toEqual([
      favPortrait.id,
      midLandscape.id,
      edgeLandscape.id,
      midPortrait.id,
    ]);
  });

  it("reads orientation: a rotated landscape sensor image is portrait", () => {
    const rotated = photo({ exif: { orientation: "6" } });
    expect(displaySize(rotated)).toEqual({ w: 3000, h: 4000 });
    const upright = photo({ at: T0 + 2 * H });
    expect(ids(rankCovers([rotated, upright], [win]))).toEqual([upright.id, rotated.id]);
  });

  it("falls back to the asset's own size", () => {
    expect(displaySize(photo({ width: 1920, height: 1080, exif: { exifImageWidth: null, exifImageHeight: null } }))).toEqual({
      w: 1920,
      h: 1080,
    });
  });

  it("is deterministic regardless of input order, and dedupes", () => {
    const list = [photo(), photo(), photo({ at: T0 + 3 * H }), photo({ isFavorite: true, at: T0 + H })];
    const a = ids(rankCovers([...list, list[0]], [win]));
    const b = ids(rankCovers([...list].reverse(), [win]));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(4);
  });
});

describe("pickCover", () => {
  it("returns null without candidates", () => {
    expect(pickCover([], 8)).toBeNull();
  });

  it("spreads the strip over time and returns it oldest first", () => {
    // A burst of five shots at the middle, and two other moments.
    const burst = [0, 1, 2, 3, 4].map((i) => photo({ at: T0 + 5 * H + i * 1000 }));
    const early = photo({ at: T0 + H });
    const late = photo({ at: T0 + 9 * H });
    const ranked = rankCovers([...burst, early, late], [win]);
    const pick = pickCover(ranked, 2, H)!;
    expect(pick.assetId).toBe(burst[0].id);
    expect(pick.more).toEqual([early.id, late.id]);
    // Short of spread-out photos, the strip fills up with the rest.
    expect(pickCover(ranked, 4, H)!.more).toHaveLength(4);
  });
});

describe("searchRanges", () => {
  it("splits one long window into day-ish parts, leaving room for the favourites search", () => {
    const r = searchRanges([{ start: T0, end: T0 + 10 * 24 * H }], 6);
    expect(r).toHaveLength(5);
    expect(r[0].start).toBe(T0);
    expect(r[4].end).toBe(T0 + 10 * 24 * H);
  });

  it("caps many windows", () => {
    const ws = Array.from({ length: 9 }, (_, i) => ({ start: T0 + i * 2 * H, end: T0 + (i * 2 + 1) * H }));
    expect(searchRanges(ws, 6)).toHaveLength(6);
  });
});

describe("inputHash", () => {
  it("changes with the windows and the server, not with sub-minute noise", () => {
    const spec = { key: "k", windows: [win] };
    const h = inputHash("http://a", spec);
    expect(inputHash("http://a", { key: "k", windows: [{ ...win, end: win.end + 1000 }] })).toBe(h);
    expect(inputHash("http://a", { key: "k", windows: [{ ...win, end: win.end + H }] })).not.toBe(h);
    expect(inputHash("http://b", spec)).not.toBe(h);
  });
});
