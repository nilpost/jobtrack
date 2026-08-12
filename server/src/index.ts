import { serve } from "@hono/node-server"

import { createApp } from "./app.ts"
import { SyncStore } from "./db.ts"

/**
 * Boot. Every configuration mistake that would result in an insecure or
 * silently-broken server is turned into a refusal to start, with the exact
 * fix in the message — a self-hoster finds out at `docker compose up`, not
 * after their applications are readable by anyone who finds the URL.
 */

function required(name: string, hint: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`\n[jobtrack-sync] Refusing to start: ${name} is not set.\n  ${hint}\n`)
    process.exit(1)
  }
  return value
}

// A weak shared secret is the whole security model here, so a short one is
// rejected outright rather than warned about.
const syncToken = required(
  "JOBTRACK_SYNC_TOKEN",
  "This is the shared secret the app authenticates with. Generate one with:\n" +
    "    openssl rand -base64 32\n" +
    "  then set it here and paste the same value into the app's Sync settings.",
)
if (syncToken.length < 24) {
  console.error("\n[jobtrack-sync] Refusing to start: JOBTRACK_SYNC_TOKEN is too short.")
  console.error("  Use at least 24 characters — `openssl rand -base64 32`.\n")
  process.exit(1)
}

const sessionSecret = required(
  "JOBTRACK_SESSION_SECRET",
  "Signs the OAuth state and identity cookies. Generate with:\n" +
    "    openssl rand -base64 32",
)

const appOrigin = required(
  "JOBTRACK_APP_ORIGIN",
  "The exact origin the app is served from, e.g. https://jobs.example.com\n" +
    "  (scheme + host, no trailing slash). Used for CORS and as the only\n" +
    "  permitted post-login redirect target.",
)

const dbPath = process.env.JOBTRACK_DB_PATH ?? "/data/jobtrack.sqlite"
const port = Number(process.env.PORT ?? 8787)

// LinkedIn is optional. Half-configured is treated as unconfigured *and*
// reported, because a silently-disabled sign-in button is the kind of thing
// that gets debugged for an hour.
const clientId = process.env.LINKEDIN_CLIENT_ID
const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
const redirectUri = process.env.LINKEDIN_REDIRECT_URI
const linkedinVars = [clientId, clientSecret, redirectUri]
const linkedinConfigured = linkedinVars.every(Boolean)

if (!linkedinConfigured && linkedinVars.some(Boolean)) {
  console.warn(
    "[jobtrack-sync] LinkedIn sign-in is DISABLED: LINKEDIN_CLIENT_ID, " +
      "LINKEDIN_CLIENT_SECRET and LINKEDIN_REDIRECT_URI must all be set.",
  )
}

const store = new SyncStore(dbPath)
const app = createApp({
  store,
  syncToken,
  sessionSecret,
  appOrigin,
  linkedin: linkedinConfigured
    ? { clientId: clientId!, clientSecret: clientSecret!, redirectUri: redirectUri! }
    : undefined,
})

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[jobtrack-sync] listening on :${info.port}`)
  console.log(`[jobtrack-sync] database: ${dbPath}`)
  console.log(`[jobtrack-sync] app origin: ${appOrigin}`)
  console.log(`[jobtrack-sync] LinkedIn sign-in: ${linkedinConfigured ? "enabled" : "disabled"}`)
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    store.close()
    process.exit(0)
  })
}
