import { getLocalSyncState, replaceLocalSyncState } from "./db"

/**
 * Client for the optional self-hosted sync backend (server/).
 *
 * Everything here is opt-in and additive: with no endpoint configured the
 * app never calls out, which is the whole local-first promise. Nothing in
 * the rest of the app imports this module, so a browser that never enables
 * sync doesn't even run this code.
 */

const STORAGE_KEY = "jobtrack.sync"

export interface SyncConfig {
  /** Origin of the sync server, e.g. https://sync.example.com — no path. */
  endpoint: string
  /** Optional: absent when authorising with Google instead of a shared
   *  token. One of the two must work or sync 401s. */
  token?: string
}

/**
 * Stored in localStorage rather than IndexedDB deliberately: this is
 * per-device configuration, not user data. It must NOT travel with an
 * export, a CSV, or the sync payload itself — a token that syncs to other
 * devices is a token that leaks to wherever the data goes.
 */
export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    // The endpoint alone is a valid configuration now: with Google sign-in
    // the credential is a cookie the server set, not something stored here.
    if (!parsed.endpoint) return null
    return { endpoint: parsed.endpoint, token: parsed.token || undefined }
  } catch {
    return null
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      endpoint: config.endpoint.replace(/\/+$/, ""),
      // Omitted rather than stored empty, so "signed in with Google" is
      // distinguishable from "token was cleared".
      ...(config.token ? { token: config.token } : {}),
    }),
  )
}

export function clearSyncConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export interface SyncResult {
  applications: number
  deletions: number
  hasProfile: boolean
}

/** Verifies an endpoint before the user commits to it — a wrong URL should
 *  fail here, in a settings dialog, not silently at the next sync. */
export async function checkHealth(
  endpoint: string,
): Promise<{ ok: boolean; linkedin: boolean; google: boolean }> {
  const res = await fetch(`${endpoint.replace(/\/+$/, "")}/api/health`)
  if (!res.ok) throw new Error(`Server responded ${res.status}`)
  const body = (await res.json()) as { ok?: boolean; linkedin?: boolean; google?: boolean }
  return { ok: !!body.ok, linkedin: !!body.linkedin, google: !!body.google }
}

/**
 * One round trip: push everything, receive the merged state, adopt it.
 *
 * Local state is only replaced after the response parses successfully, so a
 * network failure or a rejected payload leaves this browser exactly as it
 * was. The offline case must be a no-op, not a partial wipe.
 */
export async function syncNow(config: SyncConfig): Promise<SyncResult> {
  const local = await getLocalSyncState()

  // Both credentials are offered and the server accepts either: the bearer
  // token when one is configured, or the Google session cookie. `credentials:
  // "include"` is what carries that cookie — without it a Google-only setup
  // 401s with no indication why.
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (config.token) headers.Authorization = `Bearer ${config.token}`

  const res = await fetch(`${config.endpoint}/api/v1/sync`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(local),
  })

  if (res.status === 401) {
    throw new Error(
      config.token
        ? "Rejected by the server: check the sync token matches JOBTRACK_SYNC_TOKEN."
        : "Rejected by the server: sign in with Google again, or check that your address is in GOOGLE_ALLOWED_EMAILS.",
    )
  }
  if (!res.ok) {
    throw new Error(`Sync failed (HTTP ${res.status})`)
  }

  const merged = (await res.json()) as Awaited<ReturnType<typeof getLocalSyncState>>
  if (!Array.isArray(merged.applications) || !Array.isArray(merged.deletions)) {
    throw new Error("Sync response was not in the expected shape — nothing was changed locally.")
  }

  await replaceLocalSyncState(merged)
  return {
    applications: merged.applications.length,
    deletions: merged.deletions.length,
    hasProfile: !!merged.profile,
  }
}

// ---------------------------------------------------------------------------
// LinkedIn identity — see server/src/linkedin.ts. Identity only.
// ---------------------------------------------------------------------------

export interface LinkedInIdentity {
  name?: string
  email?: string
  picture?: string
}

export interface IdentityResponse {
  identity: (LinkedInIdentity & { provider?: string }) | null
  configured: boolean
  google?: { configured: boolean; canSync: boolean }
}

export async function fetchIdentity(endpoint: string): Promise<IdentityResponse> {
  const res = await fetch(`${endpoint.replace(/\/+$/, "")}/auth/me`, { credentials: "include" })
  if (!res.ok) return { identity: null, configured: false }
  return (await res.json()) as IdentityResponse
}

export function linkedInSignInUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/auth/linkedin/start`
}

/** See server/src/google.ts. Unlike LinkedIn, an allowlisted Google session
 *  authorises sync, which is why this is offered next to the token field. */
export function googleSignInUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/auth/google/start`
}

export async function linkedInSignOut(endpoint: string): Promise<void> {
  await fetch(`${endpoint.replace(/\/+$/, "")}/auth/logout`, {
    method: "POST",
    credentials: "include",
  })
}
