import { ago, count, displayName, fmtDayHeading, fmtDistance, fmtDuration, fmtLongDuration, fmtPercent, fmtSpan, fmtTime, inFuture, placeLabel, sentenceCase } from "../format";

const now = 1_760_781_600_000;

test("ago", () => {
  expect(ago(null, now)).toBe("never");
  expect(ago(now - 10_000, now)).toBe("just now");
  expect(ago(now + 10_000, now)).toBe("just now");
  expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
  expect(ago(now - 3 * 3_600_000, now)).toBe("3 h ago");
  expect(ago(now - 2 * 86_400_000, now)).toBe("2 d ago");
});

test("inFuture", () => {
  expect(inFuture(null, now)).toBe("now");
  expect(inFuture(now - 1, now)).toBe("now");
  expect(inFuture(now + 30_000, now)).toBe("in 30 s");
  expect(inFuture(now + 90_000, now)).toBe("in 2 min");
  expect(inFuture(now + 3_600_000 * 1.5, now)).toBe("in 2 h");
});

test("count", () => {
  expect(count(113871)).toBe("113,871");
  expect(count(0)).toBe("0");
  expect(count(null)).toBe("—");
});

test("placeLabel treats the server's placeholder as no name", () => {
  expect(placeLabel("Kamppi")).toBe("Kamppi");
  expect(placeLabel("Unknown Location")).toBe("Unnamed place");
  expect(placeLabel(null)).toBe("Unnamed place");
  expect(placeLabel("", "Somewhere")).toBe("Somewhere");
});

test("fmtSpan shows years only when the span leaves this year", () => {
  const now = new Date(2026, 9, 19, 12);
  const inYear = fmtSpan(new Date(2026, 2, 13).toISOString(), new Date(2026, 9, 18).toISOString(), now);
  expect(inYear).not.toMatch(/2026/);
  const across = fmtSpan(new Date(2025, 10, 2).toISOString(), new Date(2026, 9, 18).toISOString(), now);
  expect(across).toMatch(/2025.*2026/);
});

test("one set of number and duration rules (docs/redesign/palette.md)", () => {
  expect(fmtDistance(340)).toBe("340 m");
  expect(fmtDistance(8_400)).toBe("8.4 km");
  expect(fmtDistance(1_136_500)).toBe("1,137 km");
  expect(fmtDuration(30)).toBe("30 s");
  expect(fmtDuration(45 * 60)).toBe("45 min");
  expect(fmtDuration(6 * 3600 + 34 * 60)).toBe("6 h 34 min");
  expect(fmtDuration(1110 * 3600 + 51 * 60)).toBe("1,110 h 51 min");
  expect(fmtLongDuration(6 * 3600 + 34 * 60)).toBe("6 h 34 min");
  expect(fmtLongDuration(12 * 86_400 + 3 * 3600)).toBe("12 d 3 h");
  expect(fmtLongDuration(1110 * 3600 + 51 * 60)).toBe("46 d");
  expect(fmtPercent(0.52)).toBe("52%");
  expect(fmtPercent(0.001)).toBe("<1%");
});

test("24-hour times and day headings", () => {
  expect(fmtTime(new Date(2026, 9, 18, 9, 5).toISOString())).toBe("09:05");
  const now = new Date(2026, 9, 28, 12);
  expect(fmtDayHeading(new Date(2026, 9, 28, 8), now)).toBe("Today");
  expect(fmtDayHeading(new Date(2026, 9, 27, 8), now)).toBe("Yesterday");
  expect(fmtDayHeading(new Date(2026, 8, 30, 8), now)).toBe("Wed 30 Sep");
  expect(fmtDayHeading(new Date(2025, 9, 18, 8), now)).toBe("Sat 18 Oct 2025");
});

test("place names lose the leading postcode; tags become labels", () => {
  expect(displayName("00990 Esimerkkitie 2")).toBe("Esimerkkitie 2");
  expect(displayName("00990 Mallikatu 1")).toBe("Mallikatu 1");
  expect(displayName("1917 Bar")).toBe("1917 Bar");
  expect(placeLabel("00990 Esimerkkitie 2")).toBe("Esimerkkitie 2");
  expect(sentenceCase("artwork")).toBe("Artwork");
});
