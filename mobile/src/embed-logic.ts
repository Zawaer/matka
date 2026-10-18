// Map WebView rules (pure, tested). Contract: docs/API.md → "Map in a WebView".
//
// The WebView is logged in by a one-minute ticket URL that sets a 12 h
// httpOnly cookie. We renew it well before that (11 h), whenever the page says
// the session expired, and on a 401 from the top-level document.

/** Cookie lives 12 h on the server; renew an hour early. */
export const TICKET_RENEW_MS = 11 * 60 * 60 * 1000;
/** Don't auto-renew more often than this (a server that always says "expired" must not loop). */
export const MIN_AUTO_RENEW_GAP_MS = 30_000;

/**
 * `scheme://host[:port]`, lower-cased, default port dropped; null if `url`
 * isn't an absolute http(s) URL. Regex rather than `URL` because React
 * Native's URL implementation is incomplete.
 */
export function originOf(url: string): string | null {
  const m = /^(https?):\/\/([^/?#@]+)(?:[/?#]|$)/i.exec(url.trim());
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const hp = /^(\[[0-9a-f:.]+\]|[^:[\]]+)(?::(\d{1,5}))?$/i.exec(m[2]);
  if (!hp) return null;
  const host = hp[1].toLowerCase();
  const port = hp[2];
  const dflt = scheme === "https" ? "443" : "80";
  return `${scheme}://${host}${port && port !== dflt ? `:${port}` : ""}`;
}

export function sameOrigin(a: string, b: string): boolean {
  const oa = originOf(a);
  return oa !== null && oa === originOf(b);
}

export type NavDecision = "allow" | "external" | "block";

/**
 * What the WebView does with a navigation request: the server's own pages
 * load inside it, other web links open in the system browser, anything else
 * (intent:, file:, javascript:, custom schemes…) is refused.
 */
export function decideNavigation(url: string, server: string): NavDecision {
  if (/^about:(blank|srcdoc)$/i.test(url)) return "allow";
  if (sameOrigin(url, server)) return "allow";
  if (originOf(url) !== null) return "external";
  return "block";
}

/**
 * Adds `theme=light|dark` to the ticket URL; /embed/start forwards it to
 * /embed/map so the web map matches the app's appearance.
 */
export function withTheme(url: string, scheme: "light" | "dark"): string {
  const hash = url.indexOf("#");
  const base = hash < 0 ? url : url.slice(0, hash);
  const frag = hash < 0 ? "" : url.slice(hash);
  const clean = base.replace(/([?&])theme=[^&]*(&|$)/, (_m, pre: string, post: string) => (post ? pre : ""));
  return `${clean}${clean.includes("?") ? "&" : "?"}theme=${scheme}${frag}`;
}

/** ms until the current WebView session should be renewed. */
export function renewDelay(loadedAt: number, now: number): number {
  return Math.max(0, loadedAt + TICKET_RENEW_MS - now);
}

export function canAutoRenew(lastRenewAt: number | null, now: number): boolean {
  return lastRenewAt == null || now - lastRenewAt >= MIN_AUTO_RENEW_GAP_MS;
}

/** Text the server shows when the embed cookie or the ticket is no longer valid. */
export function isExpiredPage(text: string): boolean {
  return /session expired|map link has expired/i.test(text);
}

export const PAGE_MESSAGE = "matka-embed-page";

/**
 * Runs in the WebView after each page load and reports whether it is the
 * server's "Session expired" page. Contains no secrets.
 */
export const INJECTED_JS = `(function () {
  try {
    var text = (document.body && document.body.innerText || "").slice(0, 500);
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: ${JSON.stringify(PAGE_MESSAGE)}, text: text }));
  } catch (e) {}
})(); true;`;

/** Parses a message from INJECTED_JS; true = the page is the expired page. */
export function pageMessageExpired(data: string): boolean {
  try {
    const m = JSON.parse(data) as { type?: unknown; text?: unknown };
    return m.type === PAGE_MESSAGE && typeof m.text === "string" && isExpiredPage(m.text);
  } catch {
    return false;
  }
}
