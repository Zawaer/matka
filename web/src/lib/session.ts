import { SignJWT, jwtVerify } from "jose";
import { deriveKey } from "./crypto";

// The session cookie is an opaque random token looked up in the sessions
// table (see auth.ts). Only the short-lived OIDC login state is a signed
// cookie, since it exists before there is a user.

export const SESSION_COOKIE = "matka_session";
export const LOGIN_COOKIE = "matka_login";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, sliding
export const LOGIN_MAX_AGE = 60 * 10; // 10 minutes to finish the IdP round trip

export type LoginState = {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
};

const loginKey = () => new Uint8Array(deriveKey("login-state"));

export async function signLoginState(s: LoginState): Promise<string> {
  return new SignJWT(s)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${LOGIN_MAX_AGE}s`)
    .sign(loginKey());
}

export async function verifyLoginState(token: string | undefined): Promise<LoginState | null> {
  if (!token) return null;
  try {
    const { payload: p } = await jwtVerify(token, loginKey(), { algorithms: ["HS256"] });
    const { state, nonce, verifier, next } = p;
    return typeof state === "string" &&
      typeof nonce === "string" &&
      typeof verifier === "string" &&
      typeof next === "string"
      ? { state, nonce, verifier, next }
      : null;
  } catch {
    return null;
  }
}

/** Dev-only escape hatch so the app runs without an IdP. Never in production. */
export function authDisabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.MATKA_AUTH_DISABLED === "1";
}

/** Only allow same-origin relative redirects after login. */
export function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")
    ? raw
    : "/";
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

/** True when the cookie names a live session. Used by proxy.ts as the outer gate. */
export async function isLiveSession(token: string | undefined): Promise<boolean> {
  if (!token || token.length > 64) return false;
  const { q } = await import("./db");
  const { sha256 } = await import("./crypto");
  const rows = await q(`SELECT 1 FROM sessions WHERE id = $1 AND expires_at > now()`, [
    sha256(token),
  ]);
  return rows.length > 0;
}
