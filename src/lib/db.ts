import Dexie, { type EntityTable } from "dexie"
import type { Application, NewApplication, NoteEntry, Status } from "./types"
import type { CandidateProfile } from "./profileTypes"

/** The profile table holds exactly one row, at this fixed key — there is
 *  one candidate per browser, not many. */
const PROFILE_ID = "singleton"
type ProfileRow = CandidateProfile & { id: typeof PROFILE_ID }

/**
 * A record of a deleted application, kept after the row itself is gone.
 *
 * Only sync needs this. Without a tombstone, a deleted application is merely
 * absent from this browser's data, and the sync server — which cannot tell
 * "deleted here" from "never seen here" — pushes it back from another
 * device. Recording the deletion as a dated fact is what lets it win that
 * comparison. See server/src/sync.ts.
 */
export interface DeletionRecord {
  id: string
  deletedAt: string
}

/**
 * The only storage a fresh install needs. Nested arrays (stageHistory,
 * notes, files) are stored as structured-clone values on the row — IndexedDB
 * supports this natively, so there is no need for child tables at this scale
 * (a personal job search: dozens of applications, not millions).
 */
class JobtrackDB extends Dexie {
  applications!: EntityTable<Application, "id">
  profile!: EntityTable<ProfileRow, "id">
  deletions!: EntityTable<DeletionRecord, "id">

  constructor() {
    super("jobtrack")
    this.version(1).stores({
      // Only fields queried/sorted/filtered on need an index. Everything
      // else (notes, stageHistory, files) is read off the row directly.
      applications: "id, status, company, updatedAt",
    })
    // v2 adds the profile table for the Career Showcase tab. Dexie requires
    // restating every table's schema at each version, not just the new one
    // — the applications line is unchanged, so no migration runs for it.
    this.version(2).stores({
      applications: "id, status, company, updatedAt",
      profile: "id",
    })
    // v3 adds deletion tombstones for the optional sync backend. Additive
    // like v2 — a browser that never enables sync simply accumulates a few
    // tiny rows here and is otherwise unaffected.
    this.version(3).stores({
      applications: "id, status, company, updatedAt",
      profile: "id",
      deletions: "id",
    })
  }
}

export const db = new JobtrackDB()

function newId(): string {
  return crypto.randomUUID()
}

function nowISO(): string {
  return new Date().toISOString()
}

export async function createApplication(input: NewApplication): Promise<Application> {
  const at = nowISO()
  const stageHistory = input.stageHistory ?? [{ status: input.status, at }]
  // Sample/imported data can carry a backdated stageHistory (e.g. "applied
  // 6 days ago") — createdAt/updatedAt follow that history's actual span
  // rather than always stamping "now", so time-in-stage metrics read
  // correctly for seeded or imported applications, not just freshly-created
  // ones.
  const earliest = stageHistory.reduce((min, h) => (h.at < min ? h.at : min), stageHistory[0].at)
  const latest = stageHistory.reduce((max, h) => (h.at > max ? h.at : max), stageHistory[0].at)
  const app: Application = {
    ...input,
    id: newId(),
    stageHistory,
    notes: input.notes ?? [],
    files: input.files ?? [],
    createdAt: earliest,
    updatedAt: latest,
  }
  await db.applications.add(app)
  return app
}

export async function updateApplication(
  id: string,
  patch: Partial<Omit<Application, "id" | "createdAt">>,
): Promise<void> {
  await db.applications.update(id, { ...patch, updatedAt: nowISO() })
}

/** Changing status always appends to stageHistory — that history is what
 *  makes time-in-stage and funnel metrics possible later. */
export async function setStatus(id: string, status: Status, note?: string): Promise<void> {
  const app = await db.applications.get(id)
  if (!app) throw new Error(`Application not found: ${id}`)
  const at = nowISO()
  await db.applications.update(id, {
    status,
    stageHistory: [...app.stageHistory, { status, at, note }],
    updatedAt: at,
  })
}

export async function addNote(id: string, text: string): Promise<void> {
  const app = await db.applications.get(id)
  if (!app) throw new Error(`Application not found: ${id}`)
  const entry: NoteEntry = { at: nowISO(), text }
  await db.applications.update(id, {
    notes: [...app.notes, entry],
    updatedAt: nowISO(),
  })
}

/** Deleting always writes a tombstone in the same transaction — a delete
 *  that isn't recorded is a delete that sync will undo. */
export async function deleteApplication(id: string): Promise<void> {
  await db.transaction("rw", db.applications, db.deletions, async () => {
    await db.applications.delete(id)
    await db.deletions.put({ id, deletedAt: nowISO() })
  })
}

export async function clearAllApplications(): Promise<void> {
  await db.transaction("rw", db.applications, db.deletions, async () => {
    const ids = await db.applications.toCollection().primaryKeys()
    const at = nowISO()
    await db.applications.clear()
    await db.deletions.bulkPut(ids.map((id) => ({ id: String(id), deletedAt: at })))
  })
}

export async function countApplications(): Promise<number> {
  return db.applications.count()
}

// ---------------------------------------------------------------------------
// Candidate profile (Career Showcase tab) — a singleton row.
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<CandidateProfile | undefined> {
  const row = await db.profile.get(PROFILE_ID)
  if (!row) return undefined
  const { id: _id, ...profile } = row
  return profile
}

export async function saveProfile(profile: Omit<CandidateProfile, "updatedAt">): Promise<void> {
  await db.profile.put({ ...profile, id: PROFILE_ID, updatedAt: nowISO() })
}

// ---------------------------------------------------------------------------
// Sync bridge — only used when the optional sync backend is configured.
// ---------------------------------------------------------------------------

export interface LocalSyncState {
  applications: Application[]
  profile: CandidateProfile | null
  deletions: DeletionRecord[]
}

export async function getLocalSyncState(): Promise<LocalSyncState> {
  const [applications, profile, deletions] = await Promise.all([
    db.applications.toArray(),
    getProfile(),
    db.deletions.toArray(),
  ])
  return { applications, profile: profile ?? null, deletions }
}

/**
 * Replaces local state with the server's merged result, in one transaction.
 *
 * Wholesale replacement rather than a diff: the server already performed the
 * merge, so applying its answer field-by-field would just be a second,
 * subtly different merge — and any divergence between the two would be
 * invisible until data went missing. A partial apply is also why this is
 * transactional: half-applied state is a state no merge ever produced.
 */
export async function replaceLocalSyncState(state: LocalSyncState): Promise<void> {
  await db.transaction("rw", db.applications, db.profile, db.deletions, async () => {
    await db.applications.clear()
    await db.applications.bulkPut(state.applications)
    await db.deletions.clear()
    await db.deletions.bulkPut(state.deletions)
    await db.profile.clear()
    if (state.profile) {
      await db.profile.put({ ...state.profile, id: PROFILE_ID })
    }
  })
}
