import { describe, expect, it } from "vitest";
import { applyCorrection, correctionFor, freeAddedTrips, overlapShare, parseCorrection } from "./corrections";
import type { TransitLeg } from "./types";

const at = (hm: string) => new Date(`2026-10-27T${hm}:00+02:00`).getTime();
const iso = (hm: string) => new Date(at(hm)).toISOString();

describe("which trips a correction applies to", () => {
  const fix = { id: 1, startedAt: iso("10:36"), endedAt: iso("11:10") };

  it("covers the trip it was made on, and the same trip rebuilt with slightly different ends", () => {
    expect(correctionFor({ start: at("10:36"), end: at("11:10") }, [fix])).toBe(fix);
    expect(correctionFor({ start: at("10:33"), end: at("11:12") }, [fix])).toBe(fix); // 34 of 39 min
  });

  it("not a trip it overlaps for less than 70 % of that trip", () => {
    expect(correctionFor({ start: at("10:50"), end: at("11:40") }, [fix])).toBeNull(); // 20 of 50 min
    expect(correctionFor({ start: at("14:39"), end: at("15:14") }, [fix])).toBeNull();
  });

  it("newest wins; a zero-length trip counts when inside", () => {
    const newer = { ...fix, id: 2 };
    expect(correctionFor({ start: at("10:36"), end: at("11:10") }, [newer, fix])).toBe(newer);
    expect(overlapShare({ start: at("10:40"), end: at("10:40") }, { start: at("10:36"), end: at("11:10") })).toBe(1);
  });
});

describe("applyCorrection", () => {
  const leg = (kind: TransitLeg["kind"], line: string): TransitLeg => ({
    kind,
    lines: [line],
    fromStop: null,
    toStop: null,
    startedAt: iso("10:40"),
    endedAt: iso("10:50"),
    distance: 4000,
  });

  it("leaves uncorrected trips alone", () => {
    expect(applyCorrection("driving", [], null)).toEqual({ mode: "driving", legs: [], correctionId: null });
  });

  it("shows the user's mode and rides", () => {
    const r = applyCorrection("driving", [leg("bus", "164")], { id: 7, mode: "metro", legs: [leg("bus", "159"), leg("metro", "M1")] });
    expect(r.mode).toBe("metro");
    expect(r.legs.map((l) => l.lines[0])).toEqual(["159", "M1"]);
    expect(r.correctionId).toBe(7);
  });

  it("keeps matched rides of the corrected kind when no lines were given; none for a walk", () => {
    expect(applyCorrection("driving", [leg("bus", "159"), leg("metro", "M1")], { id: 1, mode: "bus", legs: [] }).legs.map((l) => l.lines[0])).toEqual(["159"]);
    expect(applyCorrection("bus", [leg("bus", "159")], { id: 1, mode: "walking", legs: [] }).legs).toEqual([]);
  });
});

describe("parseCorrection", () => {
  const base = { startedAt: iso("10:36"), endedAt: iso("11:10") };

  it("takes a mode and ordered rides with a transfer stop", () => {
    const r = parseCorrection({
      ...base,
      mode: "metro",
      legs: [
        { kind: "bus", line: " 159 ", transferStop: "Matinkylä" },
        { kind: "metro", line: "M1", transferStop: "ignored after the last ride" },
      ],
    });
    expect(r).toEqual({
      startedAt: at("10:36") / 1000,
      endedAt: at("11:10") / 1000,
      mode: "metro",
      legs: [
        { kind: "bus", line: "159", transferStop: "Matinkylä" },
        { kind: "metro", line: "M1", transferStop: null },
      ],
    });
  });

  it("rejects bad input", () => {
    expect(parseCorrection(null)).toHaveProperty("error");
    expect(parseCorrection({ ...base, mode: "teleport" })).toHaveProperty("error");
    expect(parseCorrection({ startedAt: base.endedAt, endedAt: base.startedAt, mode: "bus" })).toHaveProperty("error");
    expect(parseCorrection({ ...base, mode: "cycling", legs: [{ kind: "bus", line: "159" }] })).toHaveProperty("error");
    expect(parseCorrection({ ...base, mode: "bus", legs: [{ kind: "rocket", line: "1" }] })).toHaveProperty("error");
    expect(parseCorrection({ ...base, mode: "bus", legs: [{ kind: "bus", line: "" }] })).toHaveProperty("error");
  });
});

describe("added trips", () => {
  const ends = { from: { lat: 60.17, lon: 24.94 }, to: { lat: 60.205, lon: 24.79 } };
  it("parses an added trip with its ends", () => {
    const r = parseCorrection({ startedAt: iso("08:00"), endedAt: iso("08:17"), mode: "driving", added: true, ...ends });
    expect(r).toMatchObject({ mode: "driving", added: ends });
    expect(parseCorrection({ startedAt: iso("08:00"), endedAt: iso("08:17"), mode: "driving", added: true, from: ends.from })).toHaveProperty(
      "error",
    );
    expect(parseCorrection({ startedAt: iso("08:00"), endedAt: iso("08:17"), mode: "driving", ...ends })).not.toHaveProperty("added");
  });
  it("stands on its own until a detected trip takes it over", () => {
    const c = { id: 5, startedAt: iso("08:00"), endedAt: iso("08:20"), added: { ...ends, distance: 9300 } };
    const fix = { id: 6, startedAt: iso("10:00"), endedAt: iso("10:20") };
    expect(freeAddedTrips([c, fix], [])).toEqual([c]);
    expect(freeAddedTrips([c], [{ start: at("09:00"), end: at("09:30") }])).toEqual([c]);
    expect(freeAddedTrips([c], [{ start: at("08:02"), end: at("08:18") }])).toEqual([]);
  });
});
