import { isPairingLink, parsePairingUrl, validatePairing, validateServerUrl, validateToken } from "../pairing";

const TOKEN = "mtk_" + "A".repeat(40) + "b-_";

describe("validateToken", () => {
  it("accepts mtk_ + 43 base64url chars", () => {
    expect(validateToken(TOKEN)).toEqual({ ok: true, value: TOKEN });
    expect(validateToken(`  ${TOKEN}\n`)).toEqual({ ok: true, value: TOKEN });
  });
  it.each([
    "",
    "mtk_short",
    "abc_" + "A".repeat(43),
    TOKEN + "x",
    "mtk_" + "A".repeat(42) + "=",
    "mtk_" + "A".repeat(42) + "+",
  ])("rejects %p", (t) => expect(validateToken(t).ok).toBe(false));
});

describe("validateServerUrl", () => {
  it.each([
    ["https://matka.example.com", "https://matka.example.com"],
    ["https://matka.example.com/", "https://matka.example.com"],
    ["HTTPS://Matka.Example.com:8443/", "https://matka.example.com:8443"],
    ["https://example.com/matka/", "https://example.com/matka"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3000/", "http://127.0.0.1:3000"],
    ["http://10.0.2.2:3000", "http://10.0.2.2:3000"],
    ["  https://a.b  ", "https://a.b"],
  ])("accepts %p", (input, out) => expect(validateServerUrl(input)).toEqual({ ok: true, value: out }));

  it.each([
    "",
    "matka.example.com",
    "http://matka.example.com",
    "http://192.168.1.10:3000",
    "http://localhost.evil.com",
    "ftp://matka.example.com",
    "https://user:pw@matka.example.com",
    "https://matka.example.com/?x=1",
    "https://matka.example.com/#frag",
    "https://matka.example.com:99999",
    "https://bad host",
    "javascript:alert(1)",
  ])("rejects %p", (input) => expect(validateServerUrl(input).ok).toBe(false));
});

describe("parsePairingUrl", () => {
  const link = (server: string, token = TOKEN) =>
    `matka://pair?server=${encodeURIComponent(server)}&token=${token}`;

  it("parses the web app's QR payload", () => {
    expect(parsePairingUrl(link("https://matka.example.com"))).toEqual({
      ok: true,
      value: { server: "https://matka.example.com", token: TOKEN },
    });
  });
  it("tolerates param order, a slash after pair, and whitespace", () => {
    const s = encodeURIComponent("https://m.example.com/");
    expect(parsePairingUrl(` matka://pair/?token=${TOKEN}&server=${s}\n`)).toEqual({
      ok: true,
      value: { server: "https://m.example.com", token: TOKEN },
    });
  });
  it("ignores a second, smuggled server param", () => {
    const r = parsePairingUrl(
      link("https://good.example.com") + "&server=" + encodeURIComponent("https://evil.example.com"),
    );
    expect(r.ok && r.value.server).toBe("https://good.example.com");
  });
  it("rejects plain http servers", () => {
    expect(parsePairingUrl(link("http://matka.example.com")).ok).toBe(false);
  });
  it.each([
    "https://matka.example.com",
    "matka://other?server=x&token=y",
    "otherapp://pair?server=https%3A%2F%2Fa.b&token=" + TOKEN,
    "matka://pair?token=" + TOKEN,
    "matka://pair?server=https%3A%2F%2Fa.b",
    "matka://pair?server=%E0%A4%A&token=" + TOKEN,
    "matka://pair?server=https%3A%2F%2Fa.b&token=mtk_nope",
  ])("rejects %p", (u) => expect(parsePairingUrl(u).ok).toBe(false));
});

describe("parsePairingUrl, https form", () => {
  const web = (base: string, server = base, token = TOKEN) =>
    `${base}/pair#server=${encodeURIComponent(server)}&token=${token}`;

  it("parses the web app's QR payload", () => {
    expect(parsePairingUrl(web("https://matka.lan"))).toEqual({
      ok: true,
      value: { server: "https://matka.lan", token: TOKEN },
    });
  });
  it("keeps a path prefix and port, tolerates a slash after pair and case in the host", () => {
    const s = encodeURIComponent("https://example.com:8443/matka");
    expect(parsePairingUrl(`https://Example.com:8443/matka/pair/#token=${TOKEN}&server=${s}`)).toEqual({
      ok: true,
      value: { server: "https://example.com:8443/matka", token: TOKEN },
    });
  });
  it("ignores a second, smuggled server param", () => {
    const r = parsePairingUrl(web("https://good.example.com") + "&server=" + encodeURIComponent("https://evil.example.com"));
    expect(r.ok && r.value.server).toBe("https://good.example.com");
  });
  it.each([
    ["host differs from server", web("https://evil.example.com", "https://matka.example.com")],
    ["server is a subdomain", web("https://matka.example.com.evil.com", "https://matka.example.com")],
    ["port differs", web("https://matka.example.com:444", "https://matka.example.com")],
    ["path prefix differs", web("https://matka.example.com/other", "https://matka.example.com")],
    ["plain http link", web("http://localhost:3000")],
    ["http link to https server", web("http://matka.example.com", "https://matka.example.com")],
    ["token in the query, not the fragment", `https://a.b/pair?server=${encodeURIComponent("https://a.b")}&token=${TOKEN}`],
    ["not the pair page", web("https://a.b").replace("/pair#", "/pairx#")],
    ["bad token", web("https://a.b", "https://a.b", "mtk_nope")],
    ["no token", `https://a.b/pair#server=${encodeURIComponent("https://a.b")}`],
    ["credentials", web("https://u:p@a.b", "https://a.b")],
  ])("rejects %s", (_name, u) => expect(parsePairingUrl(u).ok).toBe(false));
});

describe("isPairingLink", () => {
  it.each([
    ["matka://pair?server=x&token=y", true],
    ["  https://a.b/pair#server=x", true],
    ["https://a.b/matka/pair/#x", true],
    ["https://a.b/pair", false],
    ["https://a.b/devices#pair", false],
    ["matka://other", false],
    ["", false],
  ])("%p → %p", (u, out) => expect(isPairingLink(u)).toBe(out));
  it("handles null", () => expect(isPairingLink(null)).toBe(false));
});

describe("validatePairing", () => {
  it("validates manual entry", () => {
    expect(validatePairing("https://a.example.com/", ` ${TOKEN} `)).toEqual({
      ok: true,
      value: { server: "https://a.example.com", token: TOKEN },
    });
    expect(validatePairing("https://a.example.com", "nope").ok).toBe(false);
  });
});
