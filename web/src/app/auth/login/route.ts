import { NextResponse } from "next/server";
import * as client from "openid-client";
import { appUrl } from "@/lib/appUrl";
import { authMode } from "@/lib/keyAuth";
import { oidcConfig } from "@/lib/oidc";
import { LOGIN_COOKIE, LOGIN_MAX_AGE, cookieOptions, safeNext, signLoginState } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (authMode() === "key") {
    const next = safeNext(new URL(req.url).searchParams.get("next"));
    return NextResponse.redirect(`${appUrl()}/auth/key?next=${encodeURIComponent(next)}`);
  }
  const config = await oidcConfig();
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const next = safeNext(new URL(req.url).searchParams.get("next"));

  const target = client.buildAuthorizationUrl(config, {
    redirect_uri: `${appUrl()}/auth/callback`,
    scope: "openid profile email",
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state,
    nonce,
  });

  const res = NextResponse.redirect(target);
  res.cookies.set(
    LOGIN_COOKIE,
    await signLoginState({ state, nonce, verifier, next }),
    cookieOptions(LOGIN_MAX_AGE),
  );
  return res;
}
