import { describe, expect, test } from "vitest"

import { buildAuthorizeUrl, exchangeCodeForIdentity, isAllowedToSync, type GoogleConfig } from "../src/google.ts"

const config: GoogleConfig = {
  clientId: "client-123",
  clientSecret: "secret",
  redirectUri: "https://sync.example.com/auth/google/callback",
  allowedEmails: ["owner@example.com"],
}

/** Builds an unsigned JWT — signature is irrelevant here by design; see the
 *  note on decodeIdToken in google.ts. */
function idToken(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
  return `${b64({ alg: "RS256" })}.${b64(claims)}.signature`
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: "client-123",
    sub: "google-sub-1",
    email: "Owner@Example.com",
    email_verified: true,
    name: "Owner",
    ...overrides,
  }
}

function fetchReturning(claims: Record<string, unknown>): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ id_token: idToken(claims) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch
}

describe("isAllowedToSync", () => {
  /**
   * The security property the whole feature rests on: signing in with Google
   * proves who you are, and anyone can get a Google account. Only the
   * allowlist decides who may touch the data.
   */
  test("rejects a valid Google account that is not on the allowlist", () => {
    expect(isAllowedToSync(config, "stranger@gmail.com")).toBe(false)
  })

  test("accepts an allowlisted address", () => {
    expect(isAllowedToSync(config, "owner@example.com")).toBe(true)
  })

  test("is case-insensitive — Google may return any casing", () => {
    expect(isAllowedToSync(config, "OWNER@EXAMPLE.COM")).toBe(true)
  })

  test("rejects a missing email rather than defaulting to allowed", () => {
    expect(isAllowedToSync(config, undefined)).toBe(false)
  })

  test("an empty allowlist admits nobody", () => {
    expect(isAllowedToSync({ ...config, allowedEmails: [] }, "owner@example.com")).toBe(false)
  })
})

describe("exchangeCodeForIdentity — claim validation", () => {
  test("accepts a well-formed token and normalises the email to lower case", async () => {
    const identity = await exchangeCodeForIdentity(config, "code", fetchReturning(validClaims()))
    expect(identity).toMatchObject({
      provider: "google",
      sub: "google-sub-1",
      email: "owner@example.com",
      name: "Owner",
    })
  })

  // A token minted for a DIFFERENT Google client is still a genuine,
  // correctly-signed Google token. Without the audience check it would be
  // accepted here, letting any other app's token authorise this one.
  test("rejects a token whose audience is another client", async () => {
    await expect(
      exchangeCodeForIdentity(config, "code", fetchReturning(validClaims({ aud: "someone-else" }))),
    ).rejects.toThrow(/audience/i)
  })

  test("rejects an unexpected issuer", async () => {
    await expect(
      exchangeCodeForIdentity(config, "code", fetchReturning(validClaims({ iss: "https://evil.example" }))),
    ).rejects.toThrow(/issuer/i)
  })

  // Allowlisting is by email, so an unverified address is an unproven claim
  // and must not be usable to match an allowlist entry.
  test("rejects an unverified email", async () => {
    await expect(
      exchangeCodeForIdentity(config, "code", fetchReturning(validClaims({ email_verified: false }))),
    ).rejects.toThrow(/verified email/i)
  })

  test("rejects a token with no subject", async () => {
    await expect(
      exchangeCodeForIdentity(config, "code", fetchReturning(validClaims({ sub: undefined }))),
    ).rejects.toThrow(/subject/i)
  })

  test("surfaces a failed exchange without echoing the response body", async () => {
    const failing = (async () =>
      new Response("client_secret=hunter2", { status: 400 })) as unknown as typeof fetch
    await expect(exchangeCodeForIdentity(config, "code", failing)).rejects.toThrow(
      /Google token exchange failed \(HTTP 400\)/,
    )
    await expect(exchangeCodeForIdentity(config, "code", failing)).rejects.not.toThrow(/hunter2/)
  })
})

describe("buildAuthorizeUrl", () => {
  test("requests only openid/email/profile and forces the account chooser", () => {
    const url = new URL(buildAuthorizeUrl(config, "state-abc"))
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(url.searchParams.get("scope")).toBe("openid email profile")
    expect(url.searchParams.get("state")).toBe("state-abc")
    expect(url.searchParams.get("client_id")).toBe("client-123")
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri)
    // Without this, a browser signed into several Google accounts can be
    // authorised as the wrong one with no prompt.
    expect(url.searchParams.get("prompt")).toBe("select_account")
  })
})
