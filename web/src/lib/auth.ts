import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { randomToken, sha256 } from "./crypto";
import { q } from "./db";
import { SESSION_COOKIE, SESSION_MAX_AGE, authDisabled, cookieOptions } from "./session";

export type User = {
  id: string;
  name: string;
  email: string | null;
  timezone: string;
};

const USER_COLS = `u.id, COALESCE(u.name, u.email, u.oidc_sub) AS name, u.email, u.timezone`;

/** Creates or refreshes the user for an OIDC identity. */
export async function upsertUser(sub: string, email: string | null, name: string | null) {
  const [row] = await q<{ id: string }>(
    `INSERT INTO users (oidc_sub, email, name, timezone, last_login_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (oidc_sub) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, last_login_at = now()
     RETURNING id`,
    [sub, email, name, process.env.MATKA_DEFAULT_TIMEZONE ?? "Europe/Helsinki"],
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
    const id = await upsertUser("dev", null, "Developer");
    const [u] = await q<User>(`SELECT ${USER_COLS} FROM users u WHERE id = $1`, [id]);
    return u;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 64) return null;
  // Sliding expiry; touching the row at most once a minute.
  const [u] = await q<User>(
    `WITH s AS (
       UPDATE sessions
          SET last_seen_at = now(), expires_at = now() + make_interval(secs => $2)
        WHERE id = $1 AND expires_at > now()
          AND last_seen_at < now() - interval '1 minute'
        RETURNING user_id
     )
     SELECT ${USER_COLS} FROM users u
     WHERE u.id = COALESCE(
       (SELECT user_id FROM s),
       (SELECT user_id FROM sessions WHERE id = $1 AND expires_at > now()))`,
    [sha256(token), SESSION_MAX_AGE],
  );
  return u ?? null;
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
