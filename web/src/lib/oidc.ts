import * as client from "openid-client";

// Authentik (or any OIDC provider) via openid-client. Configured from env:
//   OIDC_ISSUER         e.g. https://auth.example.com/application/o/matka/
//   OIDC_CLIENT_ID / OIDC_CLIENT_SECRET
//   MATKA_ALLOWED_USERS comma-separated OIDC `sub`s and/or emails allowed in,
//                       or "*" to admit everyone the provider authenticates

let configPromise: Promise<client.Configuration> | undefined;

export function oidcConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const issuer = process.env.OIDC_ISSUER;
    const id = process.env.OIDC_CLIENT_ID;
    const secret = process.env.OIDC_CLIENT_SECRET;
    if (!issuer || !id || !secret) {
      throw new Error("OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET must be set");
    }
    // Local test IdPs speak plain http; openid-client rejects that unless told.
    const insecure =
      process.env.NODE_ENV !== "production" && new URL(issuer).protocol === "http:";
    const opts = insecure ? { execute: [client.allowInsecureRequests] } : undefined;
    configPromise = client.discovery(new URL(issuer), id, secret, undefined, opts).catch((err) => {
      configPromise = undefined; // retry discovery on the next login
      throw err;
    });
  }
  return configPromise;
}

/**
 * Authentik lets any of its users into an app that has no policy binding, so
 * Matka keeps its own allowlist and refuses everyone when it is empty. "*"
 * hands the decision to the provider (bind a policy to the app in Authentik).
 * Prefer `sub` entries: Authentik users can edit their own email by default.
 */
export function isAllowedUser(claims: {
  sub: string;
  email?: unknown;
  email_verified?: unknown;
}): boolean {
  const allowed = (process.env.MATKA_ALLOWED_USERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.includes("*")) return true;
  // An unverified email is just a string the user typed.
  const email =
    typeof claims.email === "string" && claims.email_verified === true
      ? claims.email.toLowerCase()
      : null;
  return allowed.includes(claims.sub.toLowerCase()) || (email != null && allowed.includes(email));
}
