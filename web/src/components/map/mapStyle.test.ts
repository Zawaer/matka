import { describe, expect, it } from "vitest";
import { fitPadding, transformStyle } from "./mapStyle";

const style = {
  version: 8,
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#000" } },
    { id: "water", type: "fill", paint: { "fill-color": "#111" } },
    { id: "highway-shield-non-us", type: "symbol", layout: { "text-field": "{ref}", "icon-image": "road_1" } },
    { id: "place_state", type: "symbol", "source-layer": "place", layout: { "text-field": "{name}" } },
    {
      id: "place_city",
      type: "symbol",
      "source-layer": "place",
      layout: { "text-field": "{name}", "text-transform": "uppercase", "text-letter-spacing": 0.1, "text-font": ["Noto Sans Bold"] },
    },
    { id: "water_name", type: "symbol", "source-layer": "water_name", filter: ["==", "a", 1], layout: { "text-field": "{name}" } },
  ],
};

describe("transformStyle", () => {
  it("drops shields and state labels", () => {
    const ids = transformStyle(style, false).layers.map((l) => l.id);
    expect(ids).not.toContain("highway-shield-non-us");
    expect(ids).not.toContain("place_state");
    expect(ids).toContain("place_city");
  });

  it("uses sentence case, regular weight and Latin names in both themes", () => {
    for (const dark of [false, true]) {
      const city = transformStyle(style, dark).layers.find((l) => l.id === "place_city")!;
      expect(city.layout!["text-transform"]).toBe("none");
      expect(city.layout!["text-letter-spacing"]).toBe(0);
      expect(city.layout!["text-font"]).toEqual(["Noto Sans Regular"]);
      expect(JSON.stringify(city.layout!["text-field"])).toContain("name:en");
    }
  });

  it("keeps only sea and ocean names, idempotently", () => {
    const once = transformStyle(style, false);
    const twice = transformStyle(once, false);
    const f = (s: typeof once) => JSON.stringify(s.layers.find((l) => l.id === "water_name")!.filter);
    expect(f(once)).toContain('["ocean","sea"]');
    expect(f(twice)).toBe(f(once));
  });

  it("never writes an undefined layout or paint", () => {
    for (const l of transformStyle(style, true).layers) {
      if ("layout" in l) expect(l.layout).toBeDefined();
      if ("paint" in l) expect(l.paint).toBeDefined();
    }
  });

  it("lifts water in dark only, without touching the input", () => {
    const dark = transformStyle(style, true).layers.find((l) => l.id === "water")!;
    expect(dark.paint!["fill-color"]).not.toBe("#111");
    expect(transformStyle(style, false).layers.find((l) => l.id === "water")!.paint!["fill-color"]).toBe("#111");
    expect(style.layers[1].paint!["fill-color"]).toBe("#111");
  });
});

describe("fitPadding", () => {
  it("caps padding at a third of each side", () => {
    expect(fitPadding(1000, 600)).toEqual({ top: 56, right: 56, bottom: 40, left: 24 });
    expect(fitPadding(120, 90).top).toBe(30);
  });
});
