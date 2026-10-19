import { describe, expect, it } from "vitest";
import { appPairingLink, pairingLink, parsePairingFragment } from "./pairing";

const TOKEN = "mtk_" + "A".repeat(40) + "b-_";

describe("pairingLink", () => {
  it("puts server and token in the fragment of the /pair page", () => {
    expect(pairingLink("https://matka.lan", TOKEN)).toBe(
      `https://matka.lan/pair#server=https%3A%2F%2Fmatka.lan&token=${TOKEN}`,
    );
  });
  it("keeps a path prefix", () => {
    expect(pairingLink("https://a.b/matka", TOKEN)).toBe(
      `https://a.b/matka/pair#server=https%3A%2F%2Fa.b%2Fmatka&token=${TOKEN}`,
    );
  });
});

describe("appPairingLink", () => {
  it("builds the app's deep link", () => {
    expect(appPairingLink("https://matka.lan", TOKEN)).toBe(
      `matka://pair?server=https%3A%2F%2Fmatka.lan&token=${TOKEN}`,
    );
  });
});

describe("parsePairingFragment", () => {
  const hashOf = (link: string) => link.slice(link.indexOf("#"));

  it("round-trips pairingLink", () => {
    const link = pairingLink("https://matka.lan", TOKEN);
    expect(parsePairingFragment(hashOf(link), "https://matka.lan", "/pair")).toEqual({
      server: "https://matka.lan",
      token: TOKEN,
    });
  });
  it("round-trips a path prefix", () => {
    const link = pairingLink("https://a.b/matka", TOKEN);
    expect(parsePairingFragment(hashOf(link), "https://a.b", "/matka/pair")).toEqual({
      server: "https://a.b/matka",
      token: TOKEN,
    });
  });
  it.each([
    ["empty", "", "https://a.b", "/pair"],
    ["no token", "#server=https%3A%2F%2Fa.b", "https://a.b", "/pair"],
    ["bad token", "#server=https%3A%2F%2Fa.b&token=mtk_nope", "https://a.b", "/pair"],
    ["other origin", `#server=https%3A%2F%2Fevil.example&token=${TOKEN}`, "https://a.b", "/pair"],
    ["other port", `#server=https%3A%2F%2Fa.b%3A444&token=${TOKEN}`, "https://a.b", "/pair"],
    ["prefix mismatch", `#server=https%3A%2F%2Fa.b%2Fx&token=${TOKEN}`, "https://a.b", "/pair"],
    ["not a URL", `#server=nope&token=${TOKEN}`, "https://a.b", "/pair"],
    ["query in server", `#server=https%3A%2F%2Fa.b%2F%3Fx%3D1&token=${TOKEN}`, "https://a.b", "/pair"],
  ])("rejects %s", (_n, hash, origin, path) => expect(parsePairingFragment(hash, origin, path)).toBeNull());
});
