import { recentDays } from "../overview-logic";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const v = (id: number, placeId: number, name: string | null, start: string, hours: number | null) => ({
  id,
  placeId,
  name,
  startedAt: start,
  duration: hours == null ? null : hours * 3600,
});

test("joins back-to-back visits to one place and groups by start day", () => {
  const days = recentDays(
    [
      v(3, 1, "Esimerkkitie 2", at(18, 18, 35), 12.5),
      v(2, 1, "Esimerkkitie 2", at(17, 22, 5), 10.25),
      v(1, 1, "Esimerkkitie 2", at(17, 18, 35), 3.5),
    ],
    new Date(2026, 9, 20),
  );
  expect(days.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-17"]);
  expect(days[1].rows).toHaveLength(1);
  expect(days[1].rows[0].startedAt).toBe(at(17, 18, 35));
  expect(days[1].rows[0].duration).toBe((10.25 + 3.5) * 3600);
});

test("keeps visits apart when there was time between, and drops short unnamed stops", () => {
  const days = recentDays([
    v(3, 1, "Cafe", at(17, 15), 1),
    v(2, 9, null, at(17, 14, 30), 0.2),
    v(1, 1, "Cafe", at(17, 9), 1),
    v(0, 8, null, at(17, 7), 2),
  ]);
  expect(days[0].rows.map((r) => r.key)).toEqual(["3", "1", "0"]);
});
