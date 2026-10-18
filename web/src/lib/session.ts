import { SignJWT, jwtVerify } from "jose";

// Signed (HS256) cookies for the web session and the short-lived OIDC
// login state. Kept free of next/headers so proxy.ts can import it too.

export const SESSION_COOKIE = "matka_session";
export const LOGIN_COOKIE = "matka_login";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const LOGIN_MAX_AGE = 60 * 10; // 10 minutes to finish the IdP round trip

export type Session = { sub: string; name: string };
export type LoginState = {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
};

let cachedKey: Uint8Array | undefined;
function key(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return (cachedKey = new TextEncoder().encode(secret));
}

async function sign(payload: Record<string, unknown>, aud: string, maxAge: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(key());
}

async function verify(token: string | undefined, aud: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
      audience: aud,
    });
    return payload;
  } catch {
    return null;
  }
}

export const signSession = (s: Session) => sign(s, "session", SESSION_MAX_AGE);

export async function verifySession(token: string | undefined): Promise<Session | null> {
  const p = await verify(token, "session");
  return p && typeof p.sub === "string"
    ? { sub: p.sub, name: typeof p.name === "string" ? p.name : p.sub }
    : null;
}

export const signLoginState = (s: LoginState) => sign(s, "login", LOGIN_MAX_AGE);

export async function verifyLoginState(token: string | undefined): Promise<LoginState | null> {
  const p = await verify(token, "login");
  if (!p) return null;
  const { state, nonce, verifier, next } = p;
  return typeof state === "string" &&
    typeof nonce === "string" &&
    typeof verifier === "string" &&
    typeof next === "string"
    ? { state, nonce, verifier, next }
    : null;
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
