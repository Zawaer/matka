import { describe, expect, it } from "vitest";
import { PLACE_ICONS, PLACE_ICON_GROUPS, placeIcon, placeIconGroup } from "./placeIcons";

describe("placeIconGroup", () => {
  it("puts the saved kind first", () => {
    expect(placeIconGroup("home", "cafe")).toBe("home");
    expect(placeIconGroup("family", null)).toBe("home");
    expect(placeIconGroup("work", "supermarket")).toBe("work");
    expect(placeIconGroup("school", null)).toBe("school");
    // "other" says nothing about what the place is: its category decides.
    expect(placeIconGroup("other", "museum")).toBe("culture");
  });
  it("maps OSM values to groups", () => {
    const cases: [string, string][] = [
      ["supermarket", "shopping"],
      ["cafe", "food"],
      ["restaurant", "food"],
      ["school", "school"],
      ["library", "school"],
      ["office", "work"],
      ["apartments", "home"],
      ["station", "transit"],
      ["museum", "culture"],
      ["fitness_centre", "sports"],
      ["pharmacy", "health"],
      ["park", "nature"],
      ["hotel", "hotel"],
      ["aerodrome", "airport"],
    ];
    for (const [cat, group] of cases) expect(placeIconGroup(null, cat), cat).toBe(group);
  });
  it("falls back to the OSM key, then other", () => {
    expect(placeIconGroup(null, "bicycle", "shop")).toBe("shopping");
    expect(placeIconGroup(null, "yes", "aeroway")).toBe("airport");
    expect(placeIconGroup(null, null, null)).toBe("other");
    expect(placeIconGroup(null, "constructor")).toBe("other");
  });
  it("has a label and an app icon for every group", () => {
    for (const g of PLACE_ICON_GROUPS) {
      expect(PLACE_ICONS[g].label).toBeTruthy();
      expect(PLACE_ICONS[g].mci).toMatch(/^[a-z-]+$/);
    }
    expect(placeIcon(null, "cafe").label).toBe("Food & café");
  });
});
