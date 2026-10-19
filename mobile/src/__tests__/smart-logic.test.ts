import {
  INITIAL_STATE,
  MIN_STANDBY_GAP_MS,
  STILL_MS,
  distanceM,
  fixShowsMovement,
  parseSmartState,
  step,
  type Fix,
  type SmartState,
} from "../smart-logic";

const now = 1_760_781_600_000;
const home = { lat: 60.17, lon: 24.94 };
const still = (at: number, confidence = 80) => ({ type: "still", confidence, at });
const walking = (at: number, confidence = 80) => ({ type: "walking", confidence, at });
const fix = (ts: number, over: Partial<Fix> = {}): Fix => ({ ts, ...home, accuracy: 10, speed: 0, ...over });
const standby: SmartState = { mode: "standby", stillSince: now - 10 * 60_000, lastSwitchAt: now - 5 * 60_000, anchor: home, lastFix: { ...home, ts: now - 5 * 60_000 } };

test("distanceM", () => {
  expect(distanceM(home, home)).toBe(0);
  // 0.001° latitude ≈ 111 m
  expect(distanceM(home, { lat: home.lat + 0.001, lon: home.lon })).toBeCloseTo(111.2, 0);
});

test("enters standby only after 3 min of confident still", () => {
  let r = step(INITIAL_STATE, { activity: still(now - 60_000), fixes: [] }, now);
  expect(r.switchTo).toBeNull();
  expect(r.state.stillSince).toBe(now - 60_000);

  // Same reading seen again later: the streak keeps its start.
  r = step(r.state, { activity: still(now - 60_000), fixes: [fix(now)] }, now - 60_000 + STILL_MS);
  expect(r.switchTo).toBe("standby");
  expect(r.state.mode).toBe("standby");
  expect(r.state.anchor).toEqual(home);
});

test("low-confidence or missing activity does not start a still streak", () => {
  expect(step(INITIAL_STATE, { activity: still(now - STILL_MS * 2, 40), fixes: [] }, now).switchTo).toBeNull();
  expect(step(INITIAL_STATE, { activity: null, fixes: [fix(now)] }, now).switchTo).toBeNull();
});

test("a moving reading resets the streak", () => {
  const s = { ...INITIAL_STATE, stillSince: now - STILL_MS * 2 };
  const r = step(s, { activity: walking(now), fixes: [] }, now);
  expect(r.switchTo).toBeNull();
  expect(r.state.stillSince).toBeNull();
});

test("no re-entry within a minute of the last switch", () => {
  const s = { ...INITIAL_STATE, stillSince: now - STILL_MS * 2, lastSwitchAt: now - 30_000 };
  expect(step(s, { activity: still(now - STILL_MS * 2), fixes: [] }, now).switchTo).toBeNull();
  expect(step(s, { activity: still(now - STILL_MS * 2), fixes: [] }, now - 30_000 + MIN_STANDBY_GAP_MS).switchTo).toBe("standby");
});

test("resumes on a confident moving reading", () => {
  const r = step(standby, { activity: { type: "in_vehicle", confidence: 75, at: now }, fixes: [] }, now);
  expect(r.switchTo).toBe("active");
  expect(r.state).toMatchObject({ mode: "active", stillSince: null, lastSwitchAt: now, anchor: null });
});

test("stays in standby while still and fixes stay near the anchor", () => {
  const r = step(standby, { activity: still(now - 20 * 60_000), fixes: [fix(now, { lat: home.lat + 0.0005, accuracy: 60 })] }, now);
  expect(r.switchTo).toBeNull();
  expect(r.state.mode).toBe("standby");
  expect(r.state.lastFix?.ts).toBe(now);
});

test("resumes on a standby fix far from the stay, and restarts the countdown", () => {
  const r = step(standby, { activity: still(now - 20 * 60_000), fixes: [fix(now, { lat: home.lat + 0.002, accuracy: 30 })] }, now);
  expect(r.switchTo).toBe("active");
  expect(r.state.stillSince).toBe(now);
  // ...so it can't drop straight back to standby on the stale still reading.
  expect(step(r.state, { activity: still(now - 20 * 60_000), fixes: [] }, now + 60_000).switchTo).toBeNull();
  expect(step(r.state, { activity: still(now - 20 * 60_000), fixes: [] }, now + STILL_MS).switchTo).toBe("standby");
});

test("fix movement rules", () => {
  expect(fixShowsMovement(fix(now, { speed: 1.5, accuracy: 20 }), home)).toBe(true);
  expect(fixShowsMovement(fix(now, { speed: 1.5, accuracy: 200 }), home)).toBe(false); // vague
  expect(fixShowsMovement(fix(now, { speed: null }), home)).toBe(false);
  // 222 m away but ±300 m: could be the same place.
  expect(fixShowsMovement(fix(now, { lat: home.lat + 0.002, accuracy: 300 }), home)).toBe(false);
  expect(fixShowsMovement(fix(now, { lat: home.lat + 0.002, accuracy: null }), home)).toBe(true);
  expect(fixShowsMovement(fix(now, { lat: home.lat + 0.002 }), null)).toBe(false);
});

test("active mode ignores fix speed (GPS jitter while still)", () => {
  const s = { ...INITIAL_STATE, stillSince: now - STILL_MS };
  const r = step(s, { activity: still(now - STILL_MS), fixes: [fix(now, { speed: 3 })] }, now);
  expect(r.switchTo).toBe("standby");
});

test("parseSmartState validates", () => {
  expect(parseSmartState(null)).toEqual(INITIAL_STATE);
  expect(parseSmartState("not json")).toEqual(INITIAL_STATE);
  expect(parseSmartState("[1]")).toMatchObject({ mode: "active", stillSince: null });
  expect(parseSmartState(JSON.stringify(standby))).toEqual(standby);
  expect(parseSmartState(JSON.stringify({ mode: "weird", stillSince: "x", anchor: { lat: 1 }, lastFix: { lat: 1, lon: 2 } }))).toEqual(
    INITIAL_STATE,
  );
});
