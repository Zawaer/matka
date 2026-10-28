import { describe, expect, it } from "vitest";
import { type ConfirmFacts, needsConfirm, parsePlaceChoice, placeCandidates } from "./placeConfirm";

const stored = {
  pois: [
    { name: "Otaniemen kirjasto", key: "amenity", kind: "library", d: 22 },
    { name: "Otaniemen lukio", key: "amenity", kind: "school", d: 8 },
    { name: "Far Café", key: "amenity", kind: "cafe", d: 55 },
    { name: "otaniemen lukio", key: "amenity", kind: "school", d: 30 },
  ],
  address: "Otakaari 1",
};

describe("placeCandidates", () => {
  it("keeps POIs within 40 m nearest first, then the address, without duplicates", () => {
    expect(placeCandidates(stored)).toEqual([
      { name: "Otaniemen lukio", category: "school", address: false },
      { name: "Otaniemen kirjasto", category: "library", address: false },
      { name: "Otakaari 1", category: null, address: true },
    ]);
  });
  it("copes with nothing or junk", () => {
    expect(placeCandidates(null)).toEqual([]);
    expect(placeCandidates({ pois: "x", address: 3 })).toEqual([]);
    expect(placeCandidates({ pois: [], address: "Pohjantie 2" })).toHaveLength(1);
  });
});

describe("needsConfirm", () => {
  const base: ConfirmFacts = {
    renamed: false,
    kind: null,
    confirmed: false,
    placeVisits: 1,
    duration: 45 * 60,
    candidates: placeCandidates(stored),
  };
  it("asks about a guessed name with alternatives", () => {
    expect(needsConfirm(base)).toBe(true);
  });
  it("counts the address as an alternative, but one name alone isn't a question", () => {
    expect(needsConfirm({ ...base, candidates: placeCandidates({ pois: [stored.pois[1]], address: "Otakaari 1" }) })).toBe(true);
    expect(needsConfirm({ ...base, candidates: placeCandidates({ pois: [stored.pois[1]], address: null }) })).toBe(false);
  });
  it("never nags", () => {
    expect(needsConfirm({ ...base, renamed: true })).toBe(false);
    expect(needsConfirm({ ...base, kind: "work" })).toBe(false);
    expect(needsConfirm({ ...base, confirmed: true })).toBe(false);
    expect(needsConfirm({ ...base, placeVisits: 5 })).toBe(false);
    expect(needsConfirm({ ...base, duration: 9 * 60 })).toBe(false);
  });
});

describe("parsePlaceChoice", () => {
  it("reads yes, a candidate and a typed name", () => {
    expect(parsePlaceChoice({ confirm: true })).toEqual({ confirm: true });
    expect(parsePlaceChoice({ name: " Otaniemen lukio ", category: "school" })).toEqual({ name: "Otaniemen lukio", category: "school" });
    expect(parsePlaceChoice({ name: "Mökki" })).toEqual({ name: "Mökki", category: null });
  });
  it("refuses the rest", () => {
    expect(parsePlaceChoice(null)).toHaveProperty("error");
    expect(parsePlaceChoice({ name: "" })).toHaveProperty("error");
    expect(parsePlaceChoice({ name: "x".repeat(121) })).toHaveProperty("error");
    expect(parsePlaceChoice({ name: "A", category: "DROP TABLE" })).toHaveProperty("error");
  });
});
