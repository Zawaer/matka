import { describe, expect, it } from "vitest";
import { photoFix } from "./photoPoints";

const base = {
  id: "a",
  type: "IMAGE",
  exifInfo: { latitude: 60.17, longitude: 24.94, dateTimeOriginal: "2026-10-18T10:15:00.000Z", make: "OnePlus" },
};

describe("photoFix", () => {
  it("turns a geotagged camera photo into a fix", () => {
    expect(photoFix(base)).toEqual({ ts: Date.parse("2026-10-18T10:15:00Z") / 1000, lat: 60.17, lon: 24.94 });
  });
  it("skips screenshots and saved images (no camera make)", () => {
    expect(photoFix({ ...base, exifInfo: { ...base.exifInfo, make: null } })).toBeNull();
  });
  it("skips photos without GPS, with null island, or without a capture time", () => {
    expect(photoFix({ ...base, exifInfo: { ...base.exifInfo, latitude: null } })).toBeNull();
    expect(photoFix({ ...base, exifInfo: { ...base.exifInfo, latitude: 0, longitude: 0 } })).toBeNull();
    expect(photoFix({ ...base, exifInfo: { ...base.exifInfo, dateTimeOriginal: null } })).toBeNull();
    expect(photoFix({ ...base, exifInfo: { ...base.exifInfo, dateTimeOriginal: "1970-01-01T00:00:00Z" } })).toBeNull();
  });
  it("skips videos", () => {
    expect(photoFix({ ...base, type: "VIDEO" })).toBeNull();
  });
});
