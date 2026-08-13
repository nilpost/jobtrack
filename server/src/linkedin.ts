/**
 * "Sign in with LinkedIn" via OpenID Connect.
 *
 * Identity ONLY — this returns the user's name, email, and picture, and
 * nothing else. LinkedIn removed positions/education from self-serve API
 * access in 2023; work history is available exclusively through a
 * partner-only programme, so no amount of scope-tuning here will import a
 * career. That is what the data-export importer
 * (src/lib/importers/linkedin.ts, client-side) is for. The UI states this
 * plainly rather than letting a user infer that signing in will populate
 * their profile.
 *
 * This lives on the server and not in the browser because the authorization
 * code exchange requires the client secret. A secret shipped to a browser is
 * a published secret, so the flow cannot be completed client-side.
 */

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo"

/** openid gets the token, profile gets name/picture, email gets the address.
 *  These three are the entirety of self-serve LinkedIn OIDC. */
const SCOPES = "openid profile email"

export interface LinkedInConfig {
  clientId: string
  clientSecret: string
  /** Must byte-for-byte match a redirect URL registered on the LinkedIn app;
   *  LinkedIn rejects the exchange otherwise. */
  redirectUri: string
}

export interface LinkedInIdentity {
  name?: string
  email?: string
  picture?: string
}

export function buildAuthorizeUrl(config: LinkedInConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: SCOPES,
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCodeForIdentity(
  config: LinkedInConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedInIdentity> {
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
    // Deliberately does not include the response body: LinkedIn echoes
    // request parameters in some error responses, and this string ends up in
    // server logs.
    throw new Error(`LinkedIn token exchange failed (HTTP ${tokenRes.status})`)
  }

  const token = (await tokenRes.json()) as { access_token?: string }
  if (!token.access_token) throw new Error("LinkedIn token exchange returned no access_token")

  const userRes = await fetchImpl(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!userRes.ok) throw new Error(`LinkedIn userinfo failed (HTTP ${userRes.status})`)

  const claims = (await userRes.json()) as Record<string, unknown>
  return {
    name: typeof claims.name === "string" ? claims.name : undefined,
    email: typeof claims.email === "string" ? claims.email : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  }
}

// The signing helpers this module used to own now live in signing.ts, since
// google.ts needs the same primitives. Re-exported so existing importers of
// this module keep working.
export { sign, unsign, randomState } from "./signing.ts"
