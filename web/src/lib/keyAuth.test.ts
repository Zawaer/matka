import { afterEach, describe, expect, it } from "vitest";
import { authMode, checkLoginKey, clearFailures, isLockedOut, loginKeyConfigured, recordFailure } from "./keyAuth";

const KEY = "k".repeat(40);

describe("login key", () => {
  afterEach(() => {
    delete process.env.MATKA_AUTH;
    delete process.env.MATKA_LOGIN_KEY;
  });

  it("defaults to OIDC and switches to key mode only when asked", () => {
    expect(authMode()).toBe("oidc");
    process.env.MATKA_AUTH = "key";
    expect(authMode()).toBe("key");
    process.env.MATKA_AUTH = "KEY";
    expect(authMode()).toBe("oidc");
  });

  it("accepts the exact key, ignoring surrounding whitespace from a paste", () => {
    process.env.MATKA_LOGIN_KEY = KEY;
    expect(checkLoginKey(KEY)).toBe(true);
    expect(checkLoginKey(` ${KEY}\n`)).toBe(true);
    expect(checkLoginKey(KEY.slice(1))).toBe(false);
    expect(checkLoginKey("")).toBe(false);
  });

  it("refuses everything when the key is missing or too short", () => {
    expect(loginKeyConfigured()).toBe(false);
    expect(checkLoginKey("")).toBe(false);
    process.env.MATKA_LOGIN_KEY = "short";
    expect(loginKeyConfigured()).toBe(false);
    expect(checkLoginKey("short")).toBe(false);
  });

  it("locks an address out after 10 wrong keys for 15 minutes", () => {
    const now = 1_000_000;
    for (let i = 0; i < 9; i++) recordFailure("1.2.3.4", now);
    expect(isLockedOut("1.2.3.4", now)).toBe(false);
    recordFailure("1.2.3.4", now);
    expect(isLockedOut("1.2.3.4", now)).toBe(true);
    expect(isLockedOut("5.6.7.8", now)).toBe(false);
    expect(isLockedOut("1.2.3.4", now + 15 * 60_000 + 1)).toBe(false);
    recordFailure("9.9.9.9", now);
    clearFailures("9.9.9.9");
    expect(isLockedOut("9.9.9.9", now)).toBe(false);
  });
});
