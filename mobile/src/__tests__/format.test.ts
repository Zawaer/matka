import { ago, count, fmtSpan, inFuture, placeLabel } from "../format";

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
  expect(count(113871)).toBe("113 871");
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
