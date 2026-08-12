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
  token: string
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
    if (!parsed.endpoint || !parsed.token) return null
    return { endpoint: parsed.endpoint, token: parsed.token }
  } catch {
    return null
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ endpoint: config.endpoint.replace(/\/+$/, ""), token: config.token }),
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
export async function checkHealth(endpoint: string): Promise<{ ok: boolean; linkedin: boolean }> {
  const res = await fetch(`${endpoint.replace(/\/+$/, "")}/api/health`)
  if (!res.ok) throw new Error(`Server responded ${res.status}`)
  const body = (await res.json()) as { ok?: boolean; linkedin?: boolean }
  return { ok: !!body.ok, linkedin: !!body.linkedin }
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

  const res = await fetch(`${config.endpoint}/api/v1/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(local),
  })

  if (res.status === 401) {
    throw new Error("Rejected by the server: check the sync token matches JOBTRACK_SYNC_TOKEN.")
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

export async function fetchIdentity(
  endpoint: string,
): Promise<{ identity: LinkedInIdentity | null; configured: boolean }> {
  const res = await fetch(`${endpoint.replace(/\/+$/, "")}/auth/me`, { credentials: "include" })
  if (!res.ok) return { identity: null, configured: false }
  return (await res.json()) as { identity: LinkedInIdentity | null; configured: boolean }
}

export function linkedInSignInUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/auth/linkedin/start`
}

export async function linkedInSignOut(endpoint: string): Promise<void> {
  await fetch(`${endpoint.replace(/\/+$/, "")}/auth/logout`, {
    method: "POST",
    credentials: "include",
  })
}
