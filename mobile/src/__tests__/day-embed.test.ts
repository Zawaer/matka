import { dayEmbedUrl, isDayPage, parseDayMessage, selectDayJs, setDayJs } from "../embed-logic";
import { dayHasMap, selectionKey } from "../timeline-logic";
import type { TimelineItem } from "../viewer";

const TICKET = "https://matka.example/embed/start?ticket=abc.def";

describe("dayEmbedUrl", () => {
  it("sends the ticket on to the day map in the app's theme", () => {
    expect(dayEmbedUrl(TICKET, "2026-05-01", "dark")).toBe(
      "https://matka.example/embed/start?ticket=abc.def&to=day&date=2026-05-01&theme=dark",
    );
  });
  it("leaves out a missing or malformed date", () => {
    expect(dayEmbedUrl(TICKET, null, "light")).toBe("https://matka.example/embed/start?ticket=abc.def&to=day&theme=light");
    expect(dayEmbedUrl(TICKET, "May 1st", "light")).toBe("https://matka.example/embed/start?ticket=abc.def&to=day&theme=light");
  });
  it("replaces parameters the server already put there", () => {
    expect(dayEmbedUrl(`${TICKET}&to=map&date=2020-01-01`, "2026-05-01", "light")).toBe(
      "https://matka.example/embed/start?ticket=abc.def&to=day&date=2026-05-01&theme=light",
    );
  });
});

describe("isDayPage", () => {
  it("tells the day map from the full map an older server redirects to", () => {
    expect(isDayPage("https://matka.example/embed/day?date=2026-05-01&theme=dark")).toBe(true);
    expect(isDayPage("https://matka.example/embed/day")).toBe(true);
    expect(isDayPage("https://matka.example/embed/map?theme=dark")).toBe(false);
    expect(isDayPage("https://matka.example/embed/start?ticket=x&to=day")).toBe(false);
  });
});

describe("injected calls", () => {
  it("only pass well-formed values into the page", () => {
    expect(setDayJs("2026-05-01")).toBe('window.matkaDay && window.matkaDay.setDate("2026-05-01"); true;');
    expect(setDayJs('"); alert(1); ("')).toBe("true;");
    expect(selectDayJs("v-12")).toBe('window.matkaDay && window.matkaDay.select("v-12"); true;');
    expect(selectDayJs(null)).toBe("window.matkaDay && window.matkaDay.select(null); true;");
    expect(selectDayJs("x-1')")).toBe("true;");
  });
});

describe("parseDayMessage", () => {
  const msg = (o: object) => JSON.stringify({ type: "matka-day", ...o });
  it("reads the page's events", () => {
    expect(parseDayMessage(msg({ event: "ready" }))).toEqual({ event: "ready" });
    expect(parseDayMessage(msg({ event: "day", date: "2026-05-01", hasMap: true }))).toEqual({
      event: "day",
      date: "2026-05-01",
      hasMap: true,
    });
    expect(parseDayMessage(msg({ event: "select", key: "m-7" }))).toEqual({ event: "select", key: "m-7" });
    expect(parseDayMessage(msg({ event: "expired" }))).toEqual({ event: "expired" });
  });
  it("ignores anything else", () => {
    expect(parseDayMessage("not json")).toBeNull();
    expect(parseDayMessage("null")).toBeNull();
    expect(parseDayMessage(JSON.stringify({ type: "matka-embed-page", text: "" }))).toBeNull();
    expect(parseDayMessage(msg({ event: "select", key: "<script>" }))).toBeNull();
    expect(parseDayMessage(msg({ event: "nope" }))).toBeNull();
  });
});

describe("day map rows", () => {
  const visit = (lat: number | null): TimelineItem => ({
    kind: "visit",
    visit: { id: 3, startedAt: "", endedAt: "", duration: 0, placeId: 1, placeName: null, category: null, lat, lon: lat },
  });
  const move = (mode: "walking" | "stationary"): TimelineItem => ({
    kind: "move",
    track: { id: 9, startedAt: "", endedAt: "", distance: 0, duration: 0, mode, legs: [], waits: [] },
  });
  it("keys rows like the web", () => {
    expect(selectionKey(visit(60))).toBe("v-3");
    expect(selectionKey(move("walking"))).toBe("m-9");
  });
  it("draws a map only when there is something on it", () => {
    expect(dayHasMap([])).toBe(false);
    expect(dayHasMap([visit(null), move("stationary")])).toBe(false);
    expect(dayHasMap([visit(60)])).toBe(true);
    expect(dayHasMap([move("walking")])).toBe(true);
  });
});
