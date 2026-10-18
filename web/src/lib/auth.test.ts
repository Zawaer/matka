import { afterEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";
import { isAllowedUser } from "./oidc";
import { safeNext } from "./session";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/places/3?x=1")).toBe("/places/3?x=1");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});

describe("isAllowedUser", () => {
  it("refuses everyone when the allowlist is empty", () => {
    delete process.env.MATKA_ALLOWED_USERS;
    expect(isAllowedUser({ sub: "abc", email: "a@b.c" })).toBe(false);
  });
  it("matches sub or email, case-insensitively", () => {
    process.env.MATKA_ALLOWED_USERS = " abc123 , Me@Example.com ";
    expect(isAllowedUser({ sub: "ABC123" })).toBe(true);
    expect(isAllowedUser({ sub: "zzz", email: "me@example.COM" })).toBe(true);
    expect(isAllowedUser({ sub: "zzz", email: "other@example.com" })).toBe(false);
    expect(isAllowedUser({ sub: "zzz", email: 42 })).toBe(false);
  });
  it("* defers to the identity provider", () => {
    process.env.MATKA_ALLOWED_USERS = "*";
    expect(isAllowedUser({ sub: "anyone" })).toBe(true);
  });
});

describe("credential encryption", () => {
  it("round-trips and detects tampering or a different secret", () => {
    process.env.MATKA_SECRET = "a".repeat(40);
    const blob = encrypt("immich-key");
    expect(decrypt(blob)).toBe("immich-key");
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] ^= 1;
    expect(decrypt(tampered)).toBeNull();
    process.env.MATKA_SECRET = "b".repeat(40);
    expect(decrypt(blob)).toBeNull();
  });
  it("refuses a short secret", () => {
    process.env.MATKA_SECRET = "short";
    expect(() => encrypt("x")).toThrow(/MATKA_SECRET/);
  });
});
