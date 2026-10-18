import { SignJWT, jwtVerify } from "jose";
import { deriveKey } from "./crypto";
import { q } from "./db";

// Lets the phone app show the web map in a WebView without putting the device
// token in a URL or cookie. The app trades its token for a one-minute ticket
// (POST /api/device/embed-ticket), opens /embed/start?ticket=… in the WebView,
// and gets an httpOnly cookie that only the map and its read-only data
// routes accept. Revoking the device ends it on the next request.

export const EMBED_COOKIE = `${process.env.NODE_ENV === "production" ? "__Host-" : ""}matka_embed`;
export const EMBED_MAX_AGE = 12 * 60 * 60;
const TICKET_TTL = 60;

const key = () => new Uint8Array(deriveKey("embed"));

type Claims = { userId: string; deviceId: string };

async function sign(c: Claims, aud: string, ttl: number) {
  return new SignJWT({ dev: c.deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.userId)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(key());
}

async function verify(token: string | undefined, aud: string): Promise<Claims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], audience: aud });
    if (typeof payload.sub !== "string" || typeof payload.dev !== "string") return null;
    // The device must still be paired.
    const live = await q(
      `SELECT 1 FROM devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [payload.dev, payload.sub],
    );
    return live.length ? { userId: payload.sub, deviceId: payload.dev } : null;
  } catch {
    return null;
  }
}

export const signTicket = (c: Claims) => sign(c, "embed-ticket", TICKET_TTL);
export const verifyTicket = (t: string | undefined) => verify(t, "embed-ticket");
export const signEmbed = (c: Claims) => sign(c, "embed", EMBED_MAX_AGE);
export const verifyEmbed = (t: string | undefined) => verify(t, "embed");
