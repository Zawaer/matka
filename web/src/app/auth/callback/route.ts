import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import * as client from "openid-client";
import { appUrl } from "@/lib/appUrl";
import { isAllowedUser, oidcConfig } from "@/lib/oidc";
import { startSession, upsertUser } from "@/lib/auth";
import { LOGIN_COOKIE, verifyLoginState } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail = (status: number, message: string) =>
  new NextResponse(`${message}\n`, { status, headers: { "content-type": "text/plain" } });

export async function GET(req: Request) {
  const jar = await cookies();
  const login = await verifyLoginState(jar.get(LOGIN_COOKIE)?.value);
  jar.delete(LOGIN_COOKIE);
  if (!login) return fail(400, "Login expired. Go back and sign in again.");

  // Behind a reverse proxy req.url carries the internal host; rebuild it on
  // the public URL so it matches the registered redirect URI.
  const { search } = new URL(req.url);
  const current = new URL(`${appUrl()}/auth/callback${search}`);

  let claims: client.IDToken | undefined;
  try {
    const tokens = await client.authorizationCodeGrant(await oidcConfig(), current, {
      pkceCodeVerifier: login.verifier,
      expectedState: login.state,
      expectedNonce: login.nonce,
      idTokenExpected: true,
    });
    claims = tokens.claims();
  } catch (err) {
    console.error("[auth/callback] token exchange failed:", err);
    return fail(400, "Sign-in failed. Go back and try again.");
  }
  if (!claims) return fail(400, "Sign-in failed: no ID token.");

  if (!isAllowedUser(claims)) {
    console.warn(
      `[auth/callback] denied sub=${claims.sub} email=${String(claims.email)} ` +
        `email_verified=${String(claims.email_verified)} (add the sub to MATKA_ALLOWED_USERS)`,
    );
    return fail(403, "This account is not allowed to use this Matka instance.");
  }

  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const userId = await upsertUser(
    claims.sub,
    str(claims.email),
    claims.email_verified === true,
    str(claims.name) ?? str(claims.preferred_username),
  );
  await startSession(userId);
  return NextResponse.redirect(`${appUrl()}${login.next}`);
}
