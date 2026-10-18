import { ago, count, inFuture } from "../format";

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
