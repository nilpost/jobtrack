import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * Signed values — used for the OAuth CSRF state parameter and the identity
 * cookie, by every provider. HMAC rather than encryption because none of
 * this is secret; what matters is that the browser cannot forge it.
 *
 * Lives here rather than in linkedin.ts because google.ts needs the same
 * primitives, and one provider importing crypto helpers from another would
 * be a confusing dependency.
 */

export function sign(value: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(value).digest("base64url")
  return `${Buffer.from(value).toString("base64url")}.${mac}`
}

/** Returns null on any tampering rather than throwing — a bad cookie is an
 *  expected condition (rotated secret, forged value), not an error case. */
export function unsign(signed: string, secret: string): string | null {
  const dot = signed.lastIndexOf(".")
  if (dot < 0) return null
  const encoded = signed.slice(0, dot)
  const mac = signed.slice(dot + 1)

  let value: string
  try {
    value = Buffer.from(encoded, "base64url").toString()
  } catch {
    return null
  }

  const expected = createHmac("sha256", secret).update(value).digest("base64url")
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return value
}

export function randomState(): string {
  return randomBytes(16).toString("base64url")
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
