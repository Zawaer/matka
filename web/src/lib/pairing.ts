// Pairing links (contract: docs/API.md → "Pairing"). Pure, so both the
// server action and the public /pair page can use it.
//
// The QR code carries an https link to this server's /pair page. A phone's
// system camera opens that in the browser (a custom matka:// scheme it would
// just search for); the page then hands over to the app with matka://pair?….
// The token rides in the fragment, which browsers never send to the server,
// so it can't end up in access logs.

export const TOKEN_RE = /^mtk_[A-Za-z0-9_-]{43}$/;

const params = (server: string, token: string) =>
  `server=${encodeURIComponent(server)}&token=${encodeURIComponent(token)}`;

/** `https://<app>/pair#server=…&token=…`, the QR payload. */
export function pairingLink(appUrl: string, token: string): string {
  return `${appUrl}/pair#${params(appUrl, token)}`;
}

/** `matka://pair?server=…&token=…`, the deep link the app registers. */
export function appPairingLink(server: string, token: string): string {
  return `matka://pair?${params(server, token)}`;
}

export type FragmentPairing = { server: string; token: string };

/**
 * Reads `#server=…&token=…` on the /pair page. `origin` and `pathname` are the
 * page's own: the server named in the fragment must be the one serving the
 * page (same origin, and the page sits at `<server path>/pair`), so a link
 * can't dress up somebody else's server as this one.
 */
export function parsePairingFragment(
  hash: string,
  origin: string,
  pathname: string,
): FragmentPairing | null {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const server = q.get("server")?.trim().replace(/\/+$/, "");
  const token = q.get("token")?.trim();
  if (!server || !token || !TOKEN_RE.test(token)) return null;
  let u: URL;
  try {
    u = new URL(server);
  } catch {
    return null;
  }
  if (u.username || u.password || u.search || u.hash) return null;
  if (u.origin !== origin) return null;
  const prefix = u.pathname.replace(/\/+$/, "");
  if (pathname.replace(/\/+$/, "") !== `${prefix}/pair`) return null;
  return { server: `${u.origin}${prefix}`, token };
}
