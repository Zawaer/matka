import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { embedCookieOptions, frameAncestors, frameHeaders } from "./frameAncestors";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

describe("frameAncestors", () => {
  it("is empty by default", () => {
    expect(frameAncestors(undefined)).toEqual([]);
    expect(frameAncestors("")).toEqual([]);
    expect(frameAncestors("   ")).toEqual([]);
  });
  it("keeps space-separated origins, once each", () => {
    expect(frameAncestors(" https://app.example.com  http://localhost:8081 https://app.example.com/ ")).toEqual([
      "https://app.example.com",
      "http://localhost:8081",
    ]);
  });
  it("drops anything that isn't a plain origin", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const bad of ["*", "'self'", "https://*.example.com", "https://example.com/path", "javascript:alert(1)", "example.com", "https:"]) {
      expect(frameAncestors(bad)).toEqual([]);
    }
  });
});

describe("frameHeaders", () => {
  it("denies framing when nothing is allowed", () => {
    expect(frameHeaders("/embed/day", [])).toEqual(["X-Frame-Options", "DENY"]);
    expect(frameHeaders("/embed/map", [])).toEqual(["X-Frame-Options", "DENY"]);
  });
  it("allows the given origins on the embed routes only", () => {
    const o = ["https://a.example.com", "https://b.example.com"];
    for (const p of ["/embed/start", "/embed/map", "/embed/day"]) {
      expect(frameHeaders(p, o)).toEqual(["Content-Security-Policy", "frame-ancestors https://a.example.com https://b.example.com"]);
    }
    for (const p of ["/", "/map", "/timeline", "/embed/other", "/embed/day/x", "/settings"]) {
      expect(frameHeaders(p, o)).toEqual(["X-Frame-Options", "DENY"]);
    }
  });
});

describe("embedCookieOptions", () => {
  it("stays SameSite=Lax by default", () => {
    const c = embedCookieOptions(60, []);
    expect(c.sameSite).toBe("lax");
    expect("partitioned" in c).toBe(false);
  });
  it("is SameSite=None; Secure; Partitioned when framing is allowed", () => {
    expect(embedCookieOptions(60, ["https://app.example.com"])).toMatchObject({
      sameSite: "none",
      secure: true,
      partitioned: true,
      httpOnly: true,
      path: "/",
      maxAge: 60,
    });
  });
});

describe("proxy", () => {
  const run = async (path: string) => {
    const { proxy } = await import("@/proxy");
    return proxy(new NextRequest(`http://localhost:3000${path}`));
  };

  it("sends DENY on the embed routes by default", async () => {
    delete process.env.MATKA_FRAME_ANCESTORS;
    process.env.MATKA_AUTH_DISABLED = "1";
    const res = await run("/embed/day");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
  it("sends frame-ancestors on the embed routes when allowed, even before sign-in", async () => {
    process.env.APP_URL = "http://localhost:3000";
    process.env.MATKA_FRAME_ANCESTORS = "https://app.example.com";
    for (const p of ["/embed/start?ticket=x", "/embed/map", "/embed/day?date=2026-01-02"]) {
      const res = await run(p);
      expect(res.headers.get("content-security-policy")).toBe("frame-ancestors https://app.example.com");
      expect(res.headers.get("x-frame-options")).toBeNull();
    }
  });
  it("leaves other routes to next.config.ts", async () => {
    process.env.MATKA_FRAME_ANCESTORS = "https://app.example.com";
    process.env.MATKA_AUTH_DISABLED = "1";
    const res = await run("/timeline");
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
});
