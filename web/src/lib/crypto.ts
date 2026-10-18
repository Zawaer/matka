import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

// MATKA_SECRET is the one server secret: it signs the short-lived login-state
// cookie and encrypts stored third-party credentials (Immich API keys).
// Sessions and device tokens don't depend on it (they're random + hashed).

function secret(): Buffer {
  const s = process.env.MATKA_SECRET ?? "";
  if (s.length < 32) throw new Error("MATKA_SECRET must be set to at least 32 characters");
  return Buffer.from(s, "utf8");
}

/** A 32-byte key for one purpose, so the secret is never used directly twice. */
export function deriveKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret(), Buffer.alloc(0), `matka:${purpose}`, 32));
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Random URL-safe token: 32 bytes of entropy. */
export const randomToken = () => randomBytes(32).toString("base64url");

/** AES-256-GCM: iv(12) | tag(16) | ciphertext. */
export function encrypt(plain: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", deriveKey("credentials"), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(blob: Buffer): string | null {
  try {
    const d = createDecipheriv("aes-256-gcm", deriveKey("credentials"), blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null; // wrong MATKA_SECRET or tampered value
  }
}
