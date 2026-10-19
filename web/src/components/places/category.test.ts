import { describe, expect, it } from "vitest";
import { placeCategoryLine, placeTitle } from "./category";

describe("placeTitle / placeCategoryLine", () => {
  it("prefers the name and shows the category under it", () => {
    expect(placeTitle("Oodi", "library")).toBe("Oodi");
    expect(placeCategoryLine("Oodi", "library")).toBe("Library");
  });
  it("falls back to the category without repeating it", () => {
    expect(placeTitle(null, "cafe")).toBe("Cafe");
    expect(placeCategoryLine(null, "cafe")).toBeNull();
  });
  it("calls a place with neither an unknown place, not \"Place · Place\"", () => {
    expect(placeTitle(null, null)).toBe("Unknown place");
    expect(placeTitle("Unknown Location", null)).toBe("Unknown place");
    expect(placeCategoryLine(null, null)).toBeNull();
  });
});
