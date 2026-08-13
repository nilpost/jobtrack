/**
 * "Sign in with Google" via OpenID Connect — an alternative to pasting the
 * shared sync token.
 *
 * Chosen over LinkedIn for this job: the app registration is self-serve and
 * immediate, and the `sub` claim is a stable per-user identifier. LinkedIn
 * sign-in remains identity-only and grants no sync access (see linkedin.ts).
 *
 * SECURITY — the allowlist is not optional. Sync access is granted by
 * proving control of a Google account, and *anyone* can obtain a Google
 * account. Without a list of which accounts may sync, publishing the server
 * URL would let any Google user read and overwrite the whole dataset. The
 * server refuses to enable Google sign-in with an empty allowlist (see
 * index.ts), and authorisation is re-checked against current configuration
 * on every request rather than baked into the cookie, so removing an address
 * revokes access immediately instead of at cookie expiry.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"]

/** openid gets the id_token; email and profile fill in the display fields. */
const SCOPES = "openid email profile"

export interface GoogleConfig {
  clientId: string
  clientSecret: string
  /** Must byte-for-byte match a redirect URI registered on the Google OAuth
   *  client; Google rejects the exchange otherwise. */
  redirectUri: string
  /** Lower-cased email addresses permitted to sync. Never empty in a booted
   *  server — index.ts refuses to start otherwise. */
  allowedEmails: string[]
}

export interface GoogleIdentity {
  provider: "google"
  sub: string
  email: string
  name?: string
  picture?: string
}

export function buildAuthorizeUrl(config: GoogleConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: SCOPES,
    state,
    // Without this Google silently returns no refresh token and, more
    // importantly here, may skip the account chooser when several accounts
    // are signed in — which is how you end up authorised as the wrong one.
    prompt: "select_account",
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

interface IdTokenClaims {
  iss?: string
  aud?: string
  sub?: string
  email?: string
  email_verified?: boolean | string
  name?: string
  picture?: string
  exp?: number
}

/**
 * Decodes the ID token payload WITHOUT verifying its signature.
 *
 * That is safe only because of where this token comes from: it is read from
 * the response body of a direct, server-to-server, TLS-authenticated POST to
 * Google's token endpoint, using the client secret. It never passes through
 * the browser, so there is no opportunity for it to be substituted. Google's
 * own documentation permits skipping signature verification for tokens
 * obtained this way. The claims below are still checked, because transport
 * authenticity says the token is from Google — not that it is for us.
 *
 * If this ever starts accepting an id_token from anywhere else (an implicit
 * flow, a client-side hand-off), signature verification against Google's
 * JWKS becomes mandatory.
 */
function decodeIdToken(idToken: string): IdTokenClaims {
  const parts = idToken.split(".")
  if (parts.length !== 3) throw new Error("Malformed id_token")
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString()) as IdTokenClaims
  } catch {
    throw new Error("Malformed id_token payload")
  }
}

export async function exchangeCodeForIdentity(
  config: GoogleConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity> {
  const tokenRes = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }).toString(),
  })

  if (!tokenRes.ok) {
    // Body deliberately omitted: Google echoes request parameters in some
    // error responses and this string reaches the server log.
    throw new Error(`Google token exchange failed (HTTP ${tokenRes.status})`)
  }

  const token = (await tokenRes.json()) as { id_token?: string }
  if (!token.id_token) throw new Error("Google token exchange returned no id_token")

  const claims = decodeIdToken(token.id_token)

  // Audience: proves the token was minted for THIS client, not another app
  // that happens to also use Google.
  if (claims.aud !== config.clientId) throw new Error("id_token audience mismatch")
  if (!claims.iss || !ISSUERS.includes(claims.iss)) throw new Error("id_token issuer mismatch")
  if (!claims.sub) throw new Error("id_token has no subject")

  // An unverified address must never authorise anything: allowlisting is by
  // email, and an unverified email is an unproven claim.
  const verified = claims.email_verified === true || claims.email_verified === "true"
  if (!claims.email || !verified) throw new Error("Google account has no verified email")

  return {
    provider: "google",
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  }
}

/** Case-insensitive membership test. Evaluated per request against current
 *  config so that removing an address takes effect at once. */
export function isAllowedToSync(config: GoogleConfig, email: string | undefined): boolean {
  if (!email) return false
  return config.allowedEmails.includes(email.toLowerCase())
}
