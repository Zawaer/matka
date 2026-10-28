import { describe, expect, it } from "vitest";
import { glyphUrls, inlineTileJson } from "./basemap";
import { pathOf } from "./timeline";

describe("inlineTileJson", () => {
  it("puts the TileJSON's tiles and zooms into the source instead of its url", () => {
    const src = { type: "vector", url: "https://tiles.example/planet" };
    const tj = { tiles: ["https://tiles.example/v1/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14, attribution: "OSM", vector_layers: [] };
    expect(inlineTileJson(src, tj)).toEqual({
      type: "vector",
      tiles: ["https://tiles.example/v1/{z}/{x}/{y}.pbf"],
      minzoom: 0,
      maxzoom: 14,
      attribution: "OSM",
    });
  });

  it("keeps the source as it is when the TileJSON has no usable tiles", () => {
    const src = { type: "vector", url: "https://tiles.example/planet" };
    expect(inlineTileJson(src, { tiles: [1] })).toBe(src);
    expect(inlineTileJson(src, {})).toBe(src);
  });

  it("doesn't override what the style itself says", () => {
    const src = { type: "vector", url: "u", maxzoom: 12 };
    expect(inlineTileJson(src, { tiles: ["t"], maxzoom: 14 })).toEqual({ type: "vector", tiles: ["t"], maxzoom: 12 });
  });
});

describe("glyphUrls", () => {
  const style = {
    glyphs: "https://tiles.example/fonts/{fontstack}/{range}.pbf",
    layers: [
      { id: "a", layout: { "text-font": ["Noto Sans Regular"] } },
      { id: "b", layout: { "text-font": ["Noto Sans Regular"] } },
      { id: "c", layout: { "text-font": ["Noto Sans Italic"] } },
      { id: "d", layout: { "text-font": ["step", ["zoom"], ["literal", ["X"]], 5, ["literal", ["Y"]]] } },
      { id: "e" },
    ],
  };

  it("lists the first range of each plain font stack once", () => {
    expect(glyphUrls(style)).toEqual([
      "https://tiles.example/fonts/Noto%20Sans%20Regular/0-255.pbf",
      "https://tiles.example/fonts/Noto%20Sans%20Italic/0-255.pbf",
    ]);
  });

  it("caps the list and needs a glyphs template", () => {
    expect(glyphUrls(style, 1)).toHaveLength(1);
    expect(glyphUrls({ layers: style.layers })).toEqual([]);
  });
});

describe("pathOf (the timeline's trip sketch)", () => {
  it("reads a GeoJSON LineString into [lon, lat] pairs", () => {
    expect(pathOf('{"type":"LineString","coordinates":[[24.7,60.1],[24.8,60.2]]}')).toEqual({
      path: [
        [24.7, 60.1],
        [24.8, 60.2],
      ],
    });
  });

  it("has nothing for a point, junk or no line", () => {
    expect(pathOf('{"type":"LineString","coordinates":[[24.7,60.1]]}')).toEqual({});
    expect(pathOf('{"type":"Point","coordinates":[24.7,60.1]}')).toEqual({});
    expect(pathOf("{")).toEqual({});
    expect(pathOf(null)).toEqual({});
  });
});
