import { parsePairingUrl, validatePairing, validateServerUrl, validateToken } from "../pairing";

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

describe("validatePairing", () => {
  it("validates manual entry", () => {
    expect(validatePairing("https://a.example.com/", ` ${TOKEN} `)).toEqual({
      ok: true,
      value: { server: "https://a.example.com", token: TOKEN },
    });
    expect(validatePairing("https://a.example.com", "nope").ok).toBe(false);
  });
});
