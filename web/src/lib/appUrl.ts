/**
 * Public base URL of this instance (no trailing slash). Used for the OIDC
 * redirect URI and the server address handed to paired devices, so it must be
 * what browsers and phones reach — not the container's internal address.
 */
export function appUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL must be set");
  return "http://localhost:3000";
}

/** Devices accept plain http only for these hosts (see docs/API.md). */
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

export function isDeviceSafeUrl(url: string): boolean {
  const u = new URL(url);
  return u.protocol === "https:" || (u.protocol === "http:" && DEV_HOSTS.has(u.hostname));
}
