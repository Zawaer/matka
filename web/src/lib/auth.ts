import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { randomToken, sha256 } from "./crypto";
import { q } from "./db";
import { KEY_OWNER_SUB, authMode } from "./keyAuth";
import { isAllowedUser } from "./oidc";
import {
  SESSION_ABSOLUTE_MAX_AGE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  authDisabled,
  cookieOptions,
} from "./session";

export type User = {
  id: string;
  name: string;
  email: string | null;
  timezone: string;
};

const USER_COLS = `u.id, COALESCE(u.name, u.email, u.oidc_sub) AS name, u.email, u.timezone,
  u.oidc_sub, u.email_verified`;

type UserRow = User & { oidc_sub: string; email_verified: boolean };

/**
 * The allowlist is checked on every request, not just at login, so removing
 * someone from MATKA_ALLOWED_USERS locks out their sessions and devices at once.
 */
function allowed(u: UserRow | undefined): User | null {
  if (!u) return null;
  if (!authDisabled()) {
    // Key mode has exactly one user; OIDC mode checks the allowlist.
    const ok =
      authMode() === "key"
        ? u.oidc_sub === KEY_OWNER_SUB
        : isAllowedUser({ sub: u.oidc_sub, email: u.email, email_verified: u.email_verified });
    if (!ok) return null;
  }
  return { id: u.id, name: u.name, email: u.email, timezone: u.timezone };
}

/** Creates or refreshes the user for an OIDC identity. */
export async function upsertUser(
  sub: string,
  email: string | null,
  emailVerified: boolean,
  name: string | null,
) {
  const [row] = await q<{ id: string }>(
    `INSERT INTO users (oidc_sub, email, email_verified, name, timezone, last_login_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (oidc_sub) DO UPDATE
       SET email = EXCLUDED.email, email_verified = EXCLUDED.email_verified,
           name = EXCLUDED.name, last_login_at = now()
     RETURNING id`,
    [sub, email, emailVerified, name, process.env.MATKA_DEFAULT_TIMEZONE ?? "Europe/Helsinki"],
  );
  return row.id;
}

/** Starts a session for userId and sets the cookie. */
export async function startSession(userId: string): Promise<void> {
  const token = randomToken();
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await q(
    `INSERT INTO sessions (id, user_id, expires_at, user_agent)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4)`,
    [sha256(token), userId, SESSION_MAX_AGE, ua],
  );
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE));
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q(`DELETE FROM sessions WHERE id = $1`, [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** Signs out every session of this user except the current one. */
export async function endOtherSessions(userId: string): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await q(`DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, [userId, sha256(token)]);
}

/** The signed-in user, or null. Cached per request. */
export const getUser = cache(async (): Promise<User | null> => {
  if (authDisabled()) {
    const id = await upsertUser("dev", null, false, "Developer");
    const [u] = await q<UserRow>(`SELECT ${USER_COLS} FROM users u WHERE id = $1`, [id]);
    return allowed(u);
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 64) return null;
  // Sliding expiry, capped at an absolute lifetime; touching the row at most
  // once a minute.
  const [u] = await q<UserRow>(
    `WITH s AS (
       UPDATE sessions
          SET last_seen_at = now(),
              expires_at = LEAST(now() + make_interval(secs => $2),
                                 created_at + make_interval(secs => $3))
        WHERE id = $1 AND expires_at > now()
          AND last_seen_at < now() - interval '1 minute'
        RETURNING user_id
     )
     SELECT ${USER_COLS} FROM users u
     WHERE u.id = COALESCE(
       (SELECT user_id FROM s),
       (SELECT user_id FROM sessions WHERE id = $1 AND expires_at > now()
          AND created_at > now() - make_interval(secs => $3)))`,
    [sha256(token), SESSION_MAX_AGE, SESSION_ABSOLUTE_MAX_AGE],
  );
  return allowed(u);
});

/** For pages and server actions: the user, or a redirect to login. */
export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/auth/login");
  return u;
}

/** For route handlers: the user, or a 401 response to return as-is. */
export async function apiUser(): Promise<User | NextResponse> {
  return (await getUser()) ?? NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

async function userById(id: string): Promise<User | null> {
  const [u] = await q<UserRow>(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [id]);
  return allowed(u);
}

/**
 * For the read-only GET routes the phone app's viewer uses (docs/API.md):
 * a browser session, a paired device's bearer token, or the map embed cookie
 * the app's WebView gets from an embed ticket. Never use this for anything
 * that changes data.
 */
export async function readUser(req: Request): Promise<User | NextResponse> {
  const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // A request that presents a token is judged on that token alone, so a
  // revoked device gets its 401 even if a cookie is lying around.
  if (req.headers.get("authorization")) {
    const { authenticateDevice } = await import("./devices");
    const d = await authenticateDevice(req);
    return (d && (await userById(d.userId))) || unauthorized();
  }
  const session = await getUser();
  if (session) return session;
  const { EMBED_COOKIE, verifyEmbed } = await import("./embed");
  const embed = await verifyEmbed((await cookies()).get(EMBED_COOKIE)?.value);
  return (embed && (await userById(embed.userId))) || unauthorized();
}

/** For embed pages: a browser session or a valid embed cookie. */
export async function viewerUser(): Promise<User | null> {
  const session = await getUser();
  if (session) return session;
  const { EMBED_COOKIE, verifyEmbed } = await import("./embed");
  const embed = await verifyEmbed((await cookies()).get(EMBED_COOKIE)?.value);
  return embed ? userById(embed.userId) : null;
}
