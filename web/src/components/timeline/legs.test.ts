import { describe, expect, it } from "vitest";
import type { TrackSummary, TransitLeg } from "@/lib/types";
import { subRows } from "./legs";

const leg = (kind: TransitLeg["kind"], start: string, end: string): TransitLeg => ({
  kind,
  lines: ["1"],
  fromStop: null,
  toStop: null,
  startedAt: `2026-09-04T${start}:00Z`,
  endedAt: `2026-09-04T${end}:00Z`,
  distance: 1000,
});
const track = (legs: TransitLeg[], waits: { startedAt: string; endedAt: string; stop: string | null }[] = []) =>
  ({ id: 1, startedAt: "", endedAt: "", distance: 0, duration: 0, mode: "tram", legs, waits }) as TrackSummary & {
    waits: typeof waits;
  };

describe("subRows", () => {
  it("puts a change only between two rides, even when it spans the whole trip", () => {
    const rows = subRows(track([leg("tram", "10:00", "10:00"), leg("bus", "10:30", "10:30")]));
    expect(rows.map((r) => r.kind)).toEqual(["leg", "wait", "leg"]);
    expect(rows[1]).toMatchObject({ stop: null, secs: 1800 });
  });

  it("uses the server's wait at a stop and drops waits outside the rides", () => {
    const rows = subRows(
      track(
        [leg("tram", "10:00", "10:10"), leg("bus", "10:20", "10:40")],
        [
          { startedAt: "2026-09-04T09:50:00Z", endedAt: "2026-09-04T09:58:00Z", stop: "Before" },
          { startedAt: "2026-09-04T10:11:00Z", endedAt: "2026-09-04T10:19:00Z", stop: "Kamppi" },
        ],
      ),
    );
    expect(rows.map((r) => (r.kind === "wait" ? r.stop : r.leg.kind))).toEqual(["tram", "Kamppi", "bus"]);
  });

  it("skips a quick change", () => {
    const rows = subRows(track([leg("tram", "10:00", "10:10"), leg("bus", "10:11", "10:40")]));
    expect(rows.map((r) => r.kind)).toEqual(["leg", "leg"]);
  });
});
