import { Hono } from "hono"
import { cors } from "hono/cors"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { timingSafeEqual } from "node:crypto"

import { SyncStore } from "./db.ts"
import { mergeSyncState } from "./sync.ts"
import { syncStateSchema } from "./schema.ts"
import {
  buildAuthorizeUrl,
  exchangeCodeForIdentity,
  randomState,
  sign,
  unsign,
  type LinkedInConfig,
} from "./linkedin.ts"

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
}

const STATE_COOKIE = "jobtrack_oauth_state"
const SESSION_COOKIE = "jobtrack_identity"

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
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
    c.json({ ok: true, service: "jobtrack-sync", linkedin: !!config.linkedin }),
  )

  // -------------------------------------------------------------------------
  // Sync
  // -------------------------------------------------------------------------

  app.use("/api/v1/*", async (c, next) => {
    const header = c.req.header("Authorization") ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : ""
    if (!token || !constantTimeEquals(token, config.syncToken)) {
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

  app.get("/auth/me", (c) => {
    const cookie = getCookie(c, SESSION_COOKIE)
    if (!cookie) return c.json({ identity: null, configured: !!config.linkedin })
    const raw = unsign(cookie, config.sessionSecret)
    if (!raw) return c.json({ identity: null, configured: !!config.linkedin })
    try {
      return c.json({ identity: JSON.parse(raw), configured: !!config.linkedin })
    } catch {
      return c.json({ identity: null, configured: !!config.linkedin })
    }
  })

  app.post("/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" })
    return c.json({ ok: true })
  })

  return app
}
