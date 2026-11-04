import { cookieOptions } from "./session";

// Opt-in framing of the embed pages by other sites (MATKA_FRAME_ANCESTORS).
//
// Unset (the default), every page sends `X-Frame-Options: DENY` and the embed
// cookie is SameSite=Lax, so nothing can frame Matka. Set to space-separated
// origins (e.g. "https://app.example.com"), only the embed routes below send
// `Content-Security-Policy: frame-ancestors <origins>` instead, and the embed
// cookie becomes SameSite=None; Secure; Partitioned so it still works inside a
// cross-site <iframe>. The browser session cookie and every other page keep
// their defaults. See docs/DEPLOY.md → "Embedding the map in another site".

/** The pages (and the ticket redirect) a framing site may load in an <iframe>. */
export const EMBED_FRAMEABLE = /^\/embed\/(start|map|day)$/;

let cached: { raw: string | undefined; origins: string[] } | null = null;

/**
 * The allowed origins from MATKA_FRAME_ANCESTORS: `http(s)://host[:port]` only,
 * no paths, wildcards or keywords. Anything else is dropped with a warning.
 */
export function frameAncestors(raw = process.env.MATKA_FRAME_ANCESTORS): string[] {
  if (cached && cached.raw === raw) return cached.origins;
  const out: string[] = [];
  for (const token of (raw ?? "").split(/\s+/).filter(Boolean)) {
    let origin: string | null = null;
    try {
      const u = new URL(token);
      const plain = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)$/i.test(u.hostname);
      if (plain && (u.protocol === "https:" || u.protocol === "http:") && u.origin === token.replace(/\/$/, "").toLowerCase()) {
        origin = u.origin;
      }
    } catch {
      // not a URL
    }
    if (origin) {
      if (!out.includes(origin)) out.push(origin);
    } else {
      console.warn(`[matka] MATKA_FRAME_ANCESTORS: ignoring "${token}" (expected an origin like https://app.example.com)`);
    }
  }
  cached = { raw, origins: out };
  return out;
}

/** The anti-framing header for a path: DENY everywhere, frame-ancestors on the embed routes when allowed. */
export function frameHeaders(pathname: string, origins = frameAncestors()): [string, string] {
  if (origins.length && EMBED_FRAMEABLE.test(pathname)) {
    return ["Content-Security-Policy", `frame-ancestors ${origins.join(" ")}`];
  }
  return ["X-Frame-Options", "DENY"];
}

/** Cookie attributes for the embed cookie: cross-site capable only when framing is allowed. */
export function embedCookieOptions(maxAge: number, origins = frameAncestors()) {
  const base = cookieOptions(maxAge);
  if (!origins.length) return base;
  return { ...base, sameSite: "none" as const, secure: true, partitioned: true };
}
