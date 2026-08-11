import Dexie, { type EntityTable } from "dexie"
import type { Application, NewApplication, NoteEntry, Status } from "./types"
import type { CandidateProfile } from "./profileTypes"

/** The profile table holds exactly one row, at this fixed key — there is
 *  one candidate per browser, not many. */
const PROFILE_ID = "singleton"
type ProfileRow = CandidateProfile & { id: typeof PROFILE_ID }

/**
 * The only storage a fresh install needs. Nested arrays (stageHistory,
 * notes, files) are stored as structured-clone values on the row — IndexedDB
 * supports this natively, so there is no need for child tables at this scale
 * (a personal job search: dozens of applications, not millions).
 */
class JobtrackDB extends Dexie {
  applications!: EntityTable<Application, "id">
  profile!: EntityTable<ProfileRow, "id">

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

export async function deleteApplication(id: string): Promise<void> {
  await db.applications.delete(id)
}

export async function clearAllApplications(): Promise<void> {
  await db.applications.clear()
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
