import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Two ways to sign in, chosen with MATKA_AUTH:
 *   oidc (default) - Authentik or any OIDC provider, with MATKA_ALLOWED_USERS.
 *   key            - one owner and a long login key (MATKA_LOGIN_KEY), entered once
 *                    per browser, like the API keys of other self-hosted apps. For
 *                    instances without an identity provider, e.g. behind a VPN.
 * Either way the result is the same server-side session, and phones still pair
 * with their own revocable tokens.
 */
export type AuthMode = "oidc" | "key";
export const authMode = (): AuthMode => (process.env.MATKA_AUTH === "key" ? "key" : "oidc");

/** The single user of a key-mode instance. */
export const KEY_OWNER_SUB = "key:owner";
export const MIN_KEY_LENGTH = 32;

export function loginKeyConfigured(): boolean {
  return (process.env.MATKA_LOGIN_KEY ?? "").length >= MIN_KEY_LENGTH;
}

/** Constant-time comparison of a candidate against MATKA_LOGIN_KEY. */
export function checkLoginKey(candidate: string): boolean {
  if (!loginKeyConfigured()) return false;
  const a = createHash("sha256").update(candidate.trim()).digest();
  const b = createHash("sha256").update(process.env.MATKA_LOGIN_KEY!).digest();
  return timingSafeEqual(a, b);
}

// A long random key can't be guessed, but a typo'd short key could be; slow
// down anyone hammering the form anyway. Per client address, in memory.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const failures = new Map<string, { n: number; since: number }>();

export function isLockedOut(client: string, now = Date.now()): boolean {
  const f = failures.get(client);
  if (!f) return false;
  if (now - f.since > WINDOW_MS) {
    failures.delete(client);
    return false;
  }
  return f.n >= MAX_FAILURES;
}

export function recordFailure(client: string, now = Date.now()): void {
  const f = failures.get(client);
  if (!f || now - f.since > WINDOW_MS) failures.set(client, { n: 1, since: now });
  else f.n++;
}

export function clearFailures(client: string): void {
  failures.delete(client);
}
