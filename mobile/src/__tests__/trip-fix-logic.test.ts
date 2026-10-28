import { addLeg, correctionBody, draftFromMove, moveUp, removeLeg, setTransfer } from "../trip-fix-logic";
import type { Move } from "../viewer";

const move: Move = {
  id: 1,
  startedAt: "2026-10-27T07:36:00.000Z",
  endedAt: "2026-10-27T08:10:00.000Z",
  distance: 13000,
  duration: 2040,
  mode: "driving",
  legs: [],
  waits: [],
  correctionId: null,
};

describe("trip fix draft", () => {
  it("starts from the shown mode and rides", () => {
    expect(draftFromMove(move)).toEqual({ mode: "driving", legs: [] });
    const m: Move = {
      ...move,
      mode: "metro",
      legs: [
        { kind: "bus", lines: ["159", "171"], fromStop: "Järvisilta", toStop: "Matinkylä (M)", startedAt: null, endedAt: null },
        { kind: "metro", lines: ["M1"], fromStop: "Matinkylä", toStop: "Aalto-yliopisto", startedAt: null, endedAt: null },
      ],
    };
    expect(draftFromMove(m).legs).toEqual([
      { kind: "bus", line: "159", transferStop: "Matinkylä (M)" },
      { kind: "metro", line: "M1", transferStop: "" },
    ]);
    expect(draftFromMove({ ...move, mode: "unknown" }).mode).toBe("bus");
  });

  it("adds, reorders and removes rides; a line switches a drive to transit", () => {
    let d = addLeg(draftFromMove(move), "metro", "M1");
    expect(d.mode).toBe("metro");
    d = addLeg(d, "bus", "159");
    expect(d.mode).toBe("metro");
    d = moveUp(d, 1);
    expect(d.legs.map((l) => l.line)).toEqual(["159", "M1"]);
    d = setTransfer(d, 0, " Matinkylä ");
    expect(correctionBody(move, d)).toEqual({
      startedAt: move.startedAt,
      endedAt: move.endedAt,
      mode: "metro",
      legs: [
        { kind: "bus", line: "159", transferStop: "Matinkylä" },
        { kind: "metro", line: "M1", transferStop: null },
      ],
    });
    expect(removeLeg(d, 0).legs.map((l) => l.line)).toEqual(["M1"]);
  });

  it("sends no rides for a walk", () => {
    const d = { ...addLeg(draftFromMove(move), "bus", "159"), mode: "walking" as const };
    expect(correctionBody(move, d).legs).toEqual([]);
  });
});
