import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, authDisabled, verifySession, type Session } from "./session";

/** The logged-in user for server components and server actions, or null. */
export async function getSession(): Promise<Session | null> {
  if (authDisabled()) return { sub: "dev", name: "Developer" };
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Guard for server actions and pages. proxy.ts already gates every page, but
 * server actions must not rely on that alone.
 */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/auth/login");
  return s;
}
