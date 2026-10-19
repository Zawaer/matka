import { describe, expect, it } from "vitest";
import { StopIndex } from "./stops";

describe("StopIndex", () => {
  const idx = new StopIndex([
    { lat: 60.16855, lon: 24.93152, name: "Kamppi" },
    { lat: 60.17032, lon: 24.94141, name: "Rautatientori" },
  ]);
  it("finds the nearest stop within the radius, across cell borders", () => {
    expect(idx.nearest(60.16875, 24.93174, 50)?.name).toBe("Kamppi");
    expect(idx.near(60.16875, 24.93174, 50)).toBe(true);
    expect(idx.near(60.17474, 24.79984, 50)).toBe(false);
    expect(new StopIndex([{ lat: 60.0049, lon: 25.0049 }]).near(60.0051, 25.0051, 50)).toBe(true);
  });
  it("is empty without a feed", () => {
    const empty = new StopIndex([]);
    expect(empty.size).toBe(0);
    expect(empty.near(60.16875, 24.93174, 50)).toBe(false);
  });
});
