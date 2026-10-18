// Pairing payload parsing and validation (pure; no native imports).
// Contract: docs/API.md → "Pairing".
//
//   matka://pair?server=<url-encoded base URL>&token=mtk_<43 base64url chars>

export type Pairing = { server: string; token: string };

export type PairingResult = { ok: true; value: Pairing } | { ok: false; error: string };

export const TOKEN_RE = /^mtk_[A-Za-z0-9_-]{43}$/;

/** Hosts allowed over plain http (development only, per API.md). */
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

type Checked = { ok: true; value: string } | { ok: false; error: string };

export function validateToken(raw: string): Checked {
  const token = raw.trim();
  if (!token) return { ok: false, error: "Token is empty." };
  if (!TOKEN_RE.test(token)) {
    return { ok: false, error: "Token must look like mtk_ followed by 43 letters, digits, - or _." };
  }
  return { ok: true, value: token };
}

/**
 * Normalises a server base URL: https only (http just for localhost /
 * 127.0.0.1 / 10.0.2.2), no credentials, query or fragment, no trailing slash.
 * A path prefix is kept, so `https://host/matka/` → `https://host/matka`.
 */
export function validateServerUrl(raw: string): Checked {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Server URL is empty." };
  const m = /^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(input);
  if (!m) return { ok: false, error: "Server URL must start with https://." };
  const scheme = m[1].toLowerCase();
  const authority = m[2];
  if (authority.includes("@")) return { ok: false, error: "Server URL must not contain credentials." };
  if (m[4] || m[5]) return { ok: false, error: "Server URL must not contain a query or fragment." };

  // host[:port] or [ipv6][:port]
  const hm = /^(\[[0-9a-f:.]+\]|[^:[\]]+)(?::(\d{1,5}))?$/i.exec(authority);
  if (!hm) return { ok: false, error: "Server URL has an invalid host." };
  const host = hm[1].toLowerCase();
  const port = hm[2];
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    return { ok: false, error: "Server URL has an invalid port." };
  }
  if (!/^\[.*\]$/.test(host) && !/^[a-z0-9.-]+$/.test(host)) {
    return { ok: false, error: "Server URL has an invalid host." };
  }
  if (scheme === "http" && !DEV_HOSTS.has(host)) {
    return {
      ok: false,
      error: "Server URL must use https:// (plain http is only allowed for localhost, 127.0.0.1 and 10.0.2.2).",
    };
  }

  const path = m[3].replace(/\/+$/, "");
  return { ok: true, value: `${scheme}://${host}${port ? `:${port}` : ""}${path}` };
}

/** Parses a `matka://pair?…` link (QR payload or deep link) and validates both parts. */
export function parsePairingUrl(raw: string): PairingResult {
  const input = raw.trim();
  const m = /^matka:\/\/pair\/?\?(.*)$/i.exec(input);
  if (!m) return { ok: false, error: "Not a Matka pairing code." };

  const params = parseQuery(m[1]);
  if (params == null) return { ok: false, error: "Pairing code is malformed." };
  const server = params.get("server");
  const token = params.get("token");
  if (!server) return { ok: false, error: "Pairing code has no server." };
  if (!token) return { ok: false, error: "Pairing code has no token." };

  return validatePairing(server, token);
}

/** Validates a server URL + token pair entered by hand. */
export function validatePairing(server: string, token: string): PairingResult {
  const s = validateServerUrl(server);
  if (!s.ok) return s;
  const t = validateToken(token);
  if (!t.ok) return t;
  return { ok: true, value: { server: s.value, token: t.value } };
}

function parseQuery(qs: string): Map<string, string> | null {
  const out = new Map<string, string>();
  for (const part of qs.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = eq < 0 ? part : part.slice(0, eq);
    const v = eq < 0 ? "" : part.slice(eq + 1);
    try {
      const key = decodeURIComponent(k.replace(/\+/g, " "));
      // First occurrence wins, so a smuggled second `server=` can't override.
      if (!out.has(key)) out.set(key, decodeURIComponent(v.replace(/\+/g, " ")));
    } catch {
      return null;
    }
  }
  return out;
}

/** "https://matka.example.com" → "matka.example.com" for display. */
export function displayServer(server: string): string {
  return server.replace(/^https:\/\//i, "");
}
