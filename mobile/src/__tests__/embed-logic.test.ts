import {
  INJECTED_JS,
  MIN_AUTO_RENEW_GAP_MS,
  PAGE_MESSAGE,
  TICKET_RENEW_MS,
  canAutoRenew,
  decideNavigation,
  isExpiredPage,
  originOf,
  pageMessageExpired,
  renewDelay,
  sameOrigin,
} from "../embed-logic";

const SERVER = "https://matka.example.com/prefix";

describe("originOf", () => {
  it.each([
    ["https://Matka.Example.com/embed/map?x=1", "https://matka.example.com"],
    ["https://matka.example.com:443/", "https://matka.example.com"],
    ["https://matka.example.com:8443", "https://matka.example.com:8443"],
    ["http://localhost:3000/embed", "http://localhost:3000"],
    ["http://10.0.2.2:80/", "http://10.0.2.2"],
    ["https://[::1]:8443/x", "https://[::1]:8443"],
    ["https://matka.example.com#frag", "https://matka.example.com"],
  ])("%s → %s", (url, origin) => expect(originOf(url)).toBe(origin));

  it.each([
    "javascript:alert(1)",
    "intent://scan/#Intent;scheme=zxing;end",
    "file:///etc/hosts",
    "about:blank",
    "matka://pair?x",
    "https://user:pw@matka.example.com/",
    "//matka.example.com/",
    "",
  ])("%s → null", (url) => expect(originOf(url)).toBeNull());
});

describe("sameOrigin", () => {
  it("compares scheme, host and port only", () => {
    expect(sameOrigin("https://matka.example.com/embed/map", SERVER)).toBe(true);
    expect(sameOrigin("http://matka.example.com/embed/map", SERVER)).toBe(false);
    expect(sameOrigin("https://matka.example.com.evil.net/", SERVER)).toBe(false);
    expect(sameOrigin("https://evil.net/?https://matka.example.com", SERVER)).toBe(false);
  });
});

describe("decideNavigation", () => {
  it.each([
    ["https://matka.example.com/embed/start?ticket=t", "allow"],
    ["https://matka.example.com/embed/map", "allow"],
    ["about:blank", "allow"],
    ["https://www.openstreetmap.org/copyright", "external"],
    ["http://example.org/", "external"],
    ["intent://x#Intent;end", "block"],
    ["javascript:alert(1)", "block"],
    ["file:///sdcard/x", "block"],
    ["data:text/html,hi", "block"],
    ["matka://pair?server=x&token=y", "block"],
  ])("%s → %s", (url, d) => expect(decideNavigation(url, SERVER)).toBe(d));
});

describe("ticket renewal", () => {
  const t0 = 1_760_000_000_000;
  it("renews 11 h after loading, never with a negative delay", () => {
    expect(TICKET_RENEW_MS).toBe(11 * 3600 * 1000);
    expect(renewDelay(t0, t0)).toBe(TICKET_RENEW_MS);
    expect(renewDelay(t0, t0 + 3600_000)).toBe(TICKET_RENEW_MS - 3600_000);
    expect(renewDelay(t0, t0 + 13 * 3600_000)).toBe(0);
  });

  it("limits automatic renewals so an always-expired page can't loop", () => {
    expect(canAutoRenew(null, t0)).toBe(true);
    expect(canAutoRenew(t0, t0 + 1000)).toBe(false);
    expect(canAutoRenew(t0, t0 + MIN_AUTO_RENEW_GAP_MS)).toBe(true);
  });

  it("recognises the server's expired pages", () => {
    expect(isExpiredPage("Session expired. Go back and open the map again.")).toBe(true);
    expect(isExpiredPage("This map link has expired. Go back and open the map again.\n")).toBe(true);
    expect(isExpiredPage("© OpenStreetMap contributors")).toBe(false);
  });

  it("parses messages from the injected script", () => {
    const msg = (text: string, type = PAGE_MESSAGE) => JSON.stringify({ type, text });
    expect(pageMessageExpired(msg("Session expired. Go back and open the map again."))).toBe(true);
    expect(pageMessageExpired(msg("Helsinki"))).toBe(false);
    expect(pageMessageExpired(msg("Session expired", "other"))).toBe(false);
    expect(pageMessageExpired("not json")).toBe(false);
  });

  it("injected script posts the page text and contains no secrets", () => {
    let posted = "";
    const window = { ReactNativeWebView: { postMessage: (m: string) => (posted = m) } };
    const document = { body: { innerText: "Session expired. Go back and open the map again." } };
    new Function("window", "document", INJECTED_JS)(window, document);
    expect(pageMessageExpired(posted)).toBe(true);
    expect(INJECTED_JS).not.toMatch(/mtk_|Bearer/);
  });
});
