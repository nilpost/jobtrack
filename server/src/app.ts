import { Hono } from "hono"
import { cors } from "hono/cors"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"

import { SyncStore } from "./db.ts"
import { mergeSyncState } from "./sync.ts"
import { syncStateSchema } from "./schema.ts"
import { constantTimeEquals, randomState, sign, unsign } from "./signing.ts"
import {
  buildAuthorizeUrl,
  exchangeCodeForIdentity,
  type LinkedInConfig,
} from "./linkedin.ts"
import {
  buildAuthorizeUrl as buildGoogleAuthorizeUrl,
  exchangeCodeForIdentity as exchangeGoogleCode,
  isAllowedToSync,
  type GoogleConfig,
  type GoogleIdentity,
} from "./google.ts"

export interface AppConfig {
  store: SyncStore
  /** Shared bearer token. The server refuses to boot without one — see
   *  index.ts. */
  syncToken: string
  sessionSecret: string
  /** The single origin the browser app is served from. Doubles as the CORS
   *  allowlist and the open-redirect allowlist. */
  appOrigin: string
  /** Absent when LinkedIn credentials are not configured; every /auth route
   *  then reports itself unconfigured instead of half-working. */
  linkedin?: LinkedInConfig
  /** Absent when Google credentials are not configured. When present, an
   *  allowlisted Google session is accepted as a sync credential — see the
   *  /api/v1 middleware. */
  google?: GoogleConfig
}

const STATE_COOKIE = "jobtrack_oauth_state"
const SESSION_COOKIE = "jobtrack_identity"

/** Reads and verifies the identity cookie. Returns null for absent, forged,
 *  or unparseable — all expected conditions, not errors. */
function readIdentity(
  cookie: string | undefined,
  secret: string,
): (GoogleIdentity | Record<string, unknown>) | null {
  if (!cookie) return null
  const raw = unsign(cookie, secret)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Whether the request carries a Google session currently permitted to sync.
 *
 * The allowlist is consulted here, per request, rather than trusted from
 * anything stored in the cookie — so removing an address from configuration
 * revokes access on the next request instead of whenever the cookie happens
 * to expire.
 *
 * A LinkedIn session deliberately never satisfies this: LinkedIn sign-in is
 * identity only and carries no allowlist, so honouring it would let any
 * LinkedIn user sync.
 */
function hasGoogleSyncAccess(config: AppConfig, cookie: string | undefined): boolean {
  if (!config.google) return false
  const identity = readIdentity(cookie, config.sessionSecret)
  if (!identity || identity.provider !== "google") return false
  return isAllowedToSync(config.google, identity.email as string | undefined)
}

export function createApp(config: AppConfig) {
  const app = new Hono()

  // Credentials are enabled so the identity cookie survives the cross-origin
  // hop from the app to this server, which forces an exact origin — the
  // wildcard is invalid with credentials. One configured origin, no guessing.
  app.use(
    "*",
    cors({
      origin: config.appOrigin,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  )

  // Unauthenticated on purpose: this is what a deploy check and an uptime
  // monitor hit, and it discloses nothing beyond "a jobtrack server is here".
  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "jobtrack-sync",
      linkedin: !!config.linkedin,
      google: !!config.google,
    }),
  )

  // -------------------------------------------------------------------------
  // Sync
  // -------------------------------------------------------------------------

  // Two ways to authorise sync, deliberately: the shared bearer token, or an
  // allowlisted Google session. The token path is unchanged and remains the
  // zero-dependency default; Google is an alternative for people who would
  // rather sign in than copy a secret between devices.
  app.use("/api/v1/*", async (c, next) => {
    const header = c.req.header("Authorization") ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : ""
    const tokenOk = !!token && constantTimeEquals(token, config.syncToken)

    if (!tokenOk && !hasGoogleSyncAccess(config, getCookie(c, SESSION_COOKIE))) {
      return c.json({ error: "Unauthorized" }, 401)
    }
    await next()
  })

  /**
   * The whole sync contract: the client posts its complete state, the server
   * merges and returns the merged state, and the client replaces its local
   * state with the response.
   *
   * One round trip and no deltas — for a dataset this size (a personal job
   * search) the entire payload is a few hundred kilobytes at worst, and
   * whole-state exchange removes an entire class of bug where an
   * incrementally-applied delta leaves the two sides silently divergent.
   */
  app.post("/api/v1/sync", async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Body must be JSON" }, 400)
    }

    const parsed = syncStateSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid sync payload", issues: parsed.error.issues.slice(0, 10) }, 400)
    }

    const merged = mergeSyncState(config.store.read(), parsed.data)
    config.store.write(merged)
    return c.json(merged)
  })

  // -------------------------------------------------------------------------
  // LinkedIn identity — see linkedin.ts. Never touches sync data.
  // -------------------------------------------------------------------------

  app.get("/auth/linkedin/start", (c) => {
    if (!config.linkedin) return c.json({ error: "LinkedIn sign-in is not configured" }, 501)

    const state = randomState()
    setCookie(c, STATE_COOKIE, sign(state, config.sessionSecret), {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    })
    return c.redirect(buildAuthorizeUrl(config.linkedin, state))
  })

  app.get("/auth/linkedin/callback", async (c) => {
    if (!config.linkedin) return c.json({ error: "LinkedIn sign-in is not configured" }, 501)

    const returned = c.req.query("state") ?? ""
    const cookie = getCookie(c, STATE_COOKIE) ?? ""
    const expected = unsign(cookie, config.sessionSecret)
    deleteCookie(c, STATE_COOKIE, { path: "/" })

    // Rejects both a forged state and a callback with no prior /start.
    if (!expected || !returned || !constantTimeEquals(returned, expected)) {
      return c.json({ error: "Invalid OAuth state" }, 400)
    }

    const code = c.req.query("code")
    if (!code) {
      // LinkedIn sends the user back here with an error when they decline.
      return c.redirect(`${config.appOrigin}/?linkedin=denied`)
    }

    let identity
    try {
      identity = await exchangeCodeForIdentity(config.linkedin, code)
    } catch {
      return c.redirect(`${config.appOrigin}/?linkedin=error`)
    }

    setCookie(c, SESSION_COOKIE, sign(JSON.stringify(identity), config.sessionSecret), {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    // Redirect target is the configured origin, never a request parameter —
    // echoing a caller-supplied URL here would make this an open redirect.
    return c.redirect(`${config.appOrigin}/?linkedin=ok`)
  })

  // -------------------------------------------------------------------------
  // Google identity — see google.ts. Unlike LinkedIn, an allowlisted Google
  // session IS accepted as a sync credential.
  // -------------------------------------------------------------------------

  app.get("/auth/google/start", (c) => {
    if (!config.google) return c.json({ error: "Google sign-in is not configured" }, 501)

    const state = randomState()
    setCookie(c, STATE_COOKIE, sign(state, config.sessionSecret), {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    })
    return c.redirect(buildGoogleAuthorizeUrl(config.google, state))
  })

  app.get("/auth/google/callback", async (c) => {
    if (!config.google) return c.json({ error: "Google sign-in is not configured" }, 501)

    const returned = c.req.query("state") ?? ""
    const cookie = getCookie(c, STATE_COOKIE) ?? ""
    const expected = unsign(cookie, config.sessionSecret)
    deleteCookie(c, STATE_COOKIE, { path: "/" })

    if (!expected || !returned || !constantTimeEquals(returned, expected)) {
      return c.json({ error: "Invalid OAuth state" }, 400)
    }

    const code = c.req.query("code")
    if (!code) return c.redirect(`${config.appOrigin}/?google=denied`)

    let identity: GoogleIdentity
    try {
      identity = await exchangeGoogleCode(config.google, code)
    } catch {
      return c.redirect(`${config.appOrigin}/?google=error`)
    }

    // Signing in with an account that is not on the allowlist is a normal,
    // expected outcome — say so specifically instead of a generic failure,
    // because "wrong Google account" is the likeliest cause and the fix is
    // for the operator to add the address.
    if (!isAllowedToSync(config.google, identity.email)) {
      return c.redirect(`${config.appOrigin}/?google=not_allowed`)
    }

    setCookie(c, SESSION_COOKIE, sign(JSON.stringify(identity), config.sessionSecret), {
      httpOnly: true,
      secure: true,
      // None, not Lax: this cookie authorises the sync fetch, which is a
      // cross-site subresource request whenever the app and the sync server
      // sit on different registrable domains — the common self-hosting case.
      // Lax would simply not be sent and sync would 401 with no clue why.
      sameSite: "None",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    return c.redirect(`${config.appOrigin}/?google=ok`)
  })

  app.get("/auth/me", (c) => {
    const identity = readIdentity(getCookie(c, SESSION_COOKIE), config.sessionSecret)
    return c.json({
      identity,
      configured: !!config.linkedin,
      google: {
        configured: !!config.google,
        // Whether THIS session can sync — the client uses it to decide
        // between "signed in, syncing" and "signed in, but this account is
        // not permitted".
        canSync: hasGoogleSyncAccess(config, getCookie(c, SESSION_COOKIE)),
      },
    })
  })

  app.post("/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" })
    return c.json({ ok: true })
  })

  return app
}
