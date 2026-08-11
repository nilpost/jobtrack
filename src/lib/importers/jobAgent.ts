import Papa from "papaparse"
import type {
  Application,
  AuthorizationSignal,
  FileRef,
  NewApplication,
  NoteEntry,
  StageEvent,
  Status,
} from "../types"

/**
 * Maps job-agent's (github.com/MadsLorentzen/ai-job-search) tracker data
 * into jobtrack's own model. job-agent is one import source among several
 * — this adapter is additive, one-directional (job-agent's files are never
 * written back to), and user-triggered via a re-runnable "Import" action,
 * not a continuous sync. See mergeImport() below for the upsert semantics
 * that make re-running safe.
 */

// ---------------------------------------------------------------------------
// job-agent's own shapes (only the fields this adapter reads)
// ---------------------------------------------------------------------------

/** The exact 13-column header job_search_tracker.csv ships. */
export const JOB_AGENT_TRACKER_COLUMNS = [
  "date",
  "company",
  "sector",
  "role",
  "role_type",
  "channel",
  "status",
  "contact_person",
  "fit_rating",
  "notes",
  "cv_file",
  "cover_letter_file",
  "source",
] as const

export interface JobAgentSeenJobEntry {
  title?: string
  company?: string
  url?: string
  rank_score?: number
  rank_verdict?: string
  authorization_signal?: string
}

export interface JobAgentSeenJobsFile {
  seen: Record<string, JobAgentSeenJobEntry>
}

// ---------------------------------------------------------------------------
// Vocabulary mapping — job-agent's status/signal enums are ALMOST identical
// to jobtrack's, which is exactly what makes silent drift dangerous here.
// Every value is mapped explicitly; nothing is assumed to pass through
// unchanged, even when it looks like it would.
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, Status> = {
  drafted: "draft",
  applied: "applied",
  interview: "interview",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
  no_response: "no_response",
  offer_declined: "offer_declined",
  withdrawn: "withdrawn",
}

function mapStatus(raw: string, errors: string[], context: string): Status {
  const key = raw.trim().toLowerCase()
  const mapped = STATUS_MAP[key]
  if (mapped) return mapped
  errors.push(`${context}: unrecognized status "${raw}" — imported as "applied"`)
  return "applied"
}

// job-agent's authorization_signal has a "_stated" suffix jobtrack's
// AUTHORIZATION_SIGNALS doesn't; everything else matches. Mapping this
// explicitly rather than casting is what catches the next drift too.
const AUTH_SIGNAL_MAP: Record<string, AuthorizationSignal> = {
  requires_sponsorship_stated: "requires_sponsorship",
  pr_or_citizen_required: "pr_or_citizen_required",
  domestic_only_implied: "domestic_only_implied",
  silent: "silent",
}

function mapAuthorizationSignal(raw: string | undefined): AuthorizationSignal | undefined {
  if (!raw) return undefined
  return AUTH_SIGNAL_MAP[raw.trim().toLowerCase()]
}

// ---------------------------------------------------------------------------
// Date parsing — job-agent's `date` column "may be a bare year or a full
// date" per its own documented schema. Never throw; a row with an
// unparseable date still imports, just with today's date and a warning.
// ---------------------------------------------------------------------------

export function parseJobAgentDate(raw: string, errors: string[], context: string): string {
  const trimmed = raw.trim()
  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-01-01T00:00:00.000Z`
  }
  const parsed = new Date(trimmed)
  if (trimmed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString()
  }
  if (trimmed) errors.push(`${context}: unparseable date "${raw}" — used today's date`)
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Notes — job-agent appends dated free-text lines to a single CSV cell
// (e.g. "followed up 2026-08-05", "2026-08-05 (via /gmail-sync): ..."). We
// split on newlines and pull a leading YYYY-MM-DD off each line when
// present; a line without one falls back to the row's own date rather than
// guessing further. A single-line, undated cell imports as one note.
// ---------------------------------------------------------------------------

const LEADING_DATE = /^(\d{4}-\d{2}-\d{2})\b[:\s]*(.*)$/

export function parseJobAgentNotes(raw: string, fallbackDate: string): NoteEntry[] {
  if (!raw.trim()) return []
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = LEADING_DATE.exec(line)
      if (match) {
        const iso = new Date(match[1]).toISOString()
        return { at: iso, text: match[2] || line }
      }
      return { at: fallbackDate, text: line }
    })
}

// ---------------------------------------------------------------------------
// Tracker CSV parsing
// ---------------------------------------------------------------------------

export interface ParsedJobAgentRow {
  company: string
  role: string
  roleType?: string
  sector?: string
  channel?: string
  status: Status
  fitScore?: number
  /** Only ever set by enrichFromSeenJobs — a plain CSV parse never has a
   *  verdict string or a confirmed authorization signal on its own. */
  fitVerdict?: string
  authorizationSignal?: AuthorizationSignal
  contactPerson?: string
  source?: string
  notes: NoteEntry[]
  files: FileRef[]
  stageHistory: StageEvent[]
  appliedDate: string
}

export interface JobAgentImportResult {
  rows: ParsedJobAgentRow[]
  errors: string[]
}

function emptyToUndefined(v: string | undefined): string | undefined {
  const t = v?.trim()
  return t ? t : undefined
}

/** A status implies at minimum an "applied" event before it, per job-agent's
 *  own progression (draft -> applied -> ...). Without job-agent's
 *  outcome.md (not read by this adapter), there's no distinct date for the
 *  current stage beyond the tracker row's own date — so both events share
 *  it. That's a real precision loss, not a bug: time-in-stage metrics on an
 *  imported row will read as "0 days between applied and interview" even
 *  when that's not literally true. Documented in the importer's UI. */
function stageHistoryFor(status: Status, appliedDate: string): StageEvent[] {
  if (status === "draft") return [{ status: "draft", at: appliedDate }]
  const path: StageEvent[] = [{ status: "applied", at: appliedDate }]
  if (status !== "applied") path.push({ status, at: appliedDate })
  return path
}

/** Parses job_search_tracker.csv. Never throws — a malformed row is skipped
 *  and reported, matching job-agent's own "one bad line doesn't fail the
 *  batch" convention (see /gmail-sync's date-parse handling). */
export function parseJobAgentTracker(csvText: string): JobAgentImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  const errors: string[] = [...parsed.errors.map((e) => `Row ${e.row}: ${e.message}`)]
  const rows: ParsedJobAgentRow[] = []

  parsed.data.forEach((raw, i) => {
    const context = `Row ${i + 1}`
    const company = raw.company?.trim()
    const role = raw.role?.trim()
    if (!company || !role) {
      errors.push(`${context}: missing company or role — skipped`)
      return
    }

    const appliedDate = parseJobAgentDate(raw.date ?? "", errors, context)
    const status = mapStatus(raw.status ?? "applied", errors, context)
    const fitRaw = raw.fit_rating?.trim()
    const fitScore = fitRaw ? Number(fitRaw) : undefined

    const files: FileRef[] = []
    const cv = emptyToUndefined(raw.cv_file)
    const cover = emptyToUndefined(raw.cover_letter_file)
    if (cv) files.push({ kind: "cv", filename: cv })
    if (cover) files.push({ kind: "cover_letter", filename: cover })

    rows.push({
      company,
      role,
      roleType: emptyToUndefined(raw.role_type),
      sector: emptyToUndefined(raw.sector),
      channel: emptyToUndefined(raw.channel),
      status,
      fitScore: fitScore !== undefined && !Number.isNaN(fitScore) ? fitScore : undefined,
      contactPerson: emptyToUndefined(raw.contact_person),
      source: emptyToUndefined(raw.source),
      notes: parseJobAgentNotes(raw.notes ?? "", appliedDate),
      files,
      stageHistory: stageHistoryFor(status, appliedDate),
      appliedDate,
    })
  })

  return { rows, errors }
}

// ---------------------------------------------------------------------------
// seen_jobs.json enrichment — optional. Adds fit score/verdict and the
// authorization signal to a matched tracker row. A tracker row with no
// match imports fine without enrichment; this never blocks the CSV import.
// ---------------------------------------------------------------------------

function jobKey(company: string, role: string): string {
  return `${company.trim().toLowerCase()}::${role.trim().toLowerCase()}`
}

export function enrichFromSeenJobs(
  rows: ParsedJobAgentRow[],
  seenJobs: JobAgentSeenJobsFile | undefined,
): ParsedJobAgentRow[] {
  if (!seenJobs?.seen) return rows

  const byKey = new Map<string, JobAgentSeenJobEntry>()
  for (const entry of Object.values(seenJobs.seen)) {
    if (!entry.company || !entry.title) continue
    byKey.set(jobKey(entry.company, entry.title), entry)
  }

  return rows.map((row) => {
    const match = byKey.get(jobKey(row.company, row.role))
    if (!match) return row
    return {
      ...row,
      fitScore: row.fitScore ?? match.rank_score,
      fitVerdict: match.rank_verdict ?? row.fitVerdict,
      authorizationSignal: mapAuthorizationSignal(match.authorization_signal) ?? row.authorizationSignal,
    }
  })
}

export function toNewApplications(rows: ParsedJobAgentRow[]): NewApplication[] {
  return rows.map((row) => ({
    company: row.company,
    role: row.role,
    roleType: row.roleType,
    sector: row.sector,
    channel: row.channel,
    status: row.status,
    fitScore: row.fitScore,
    fitVerdict: row.fitVerdict,
    authorizationSignal: row.authorizationSignal,
    contactPerson: row.contactPerson,
    source: row.source,
    notes: row.notes,
    files: row.files,
    stageHistory: row.stageHistory,
  }))
}

// ---------------------------------------------------------------------------
// Merge against existing jobtrack applications
// ---------------------------------------------------------------------------

export interface MergePlanCreate {
  action: "create"
  application: NewApplication
}

export interface MergePlanUpdate {
  action: "update"
  id: string
  company: string
  role: string
  /** Only present when the imported status differs from the current one —
   *  applied via setStatus (appends to stageHistory), never a raw field
   *  overwrite, so history stays real. */
  statusChange?: Status
  /** Field-level patch for everything else. Never includes a field whose
   *  imported value is blank/undefined — importing a job-agent row with an
   *  empty sector must never erase a sector the user entered locally in
   *  jobtrack. */
  patch: Partial<Pick<Application, "roleType" | "sector" | "channel" | "fitScore" | "fitVerdict" | "authorizationSignal" | "contactPerson" | "source">>
  /** Notes not already present locally (matched on exact at+text), to
   *  append — never replace. Re-running the same import twice must not
   *  duplicate notes. */
  newNotes: NoteEntry[]
  /** New file refs not already present locally (matched on kind+filename). */
  newFiles: FileRef[]
}

export type MergePlanEntry = MergePlanCreate | MergePlanUpdate

function hasNote(existing: NoteEntry[], candidate: NoteEntry): boolean {
  return existing.some((n) => n.at === candidate.at && n.text === candidate.text)
}

function hasFile(existing: FileRef[], candidate: FileRef): boolean {
  return existing.some((f) => f.kind === candidate.kind && f.filename === candidate.filename)
}

/**
 * Pure diff — no DB calls, so this is fully unit-testable and the caller
 * decides how to execute it (jobtrack's db.ts functions).
 *
 * Matching is case-insensitive on company+role, same convention job-agent's
 * own notion-sync.md uses for its tracker/seen_jobs.json join. On a match,
 * job-agent's status wins (tracker is job-agent's system of record for
 * "what actually happened") — but only status. Every other field is
 * additive: blank imported values never erase existing local data, and
 * notes/files merge rather than replace.
 */
export function mergeImport(existing: Application[], imported: NewApplication[]): MergePlanEntry[] {
  const byKey = new Map<string, Application>()
  for (const app of existing) byKey.set(jobKey(app.company, app.role), app)

  return imported.map((row): MergePlanEntry => {
    const match = byKey.get(jobKey(row.company, row.role))
    if (!match) {
      return { action: "create", application: row }
    }

    // A field lands in the patch only when the import actually DIFFERS from
    // the current value — presence alone isn't enough. Without the
    // inequality check, re-importing an unchanged CSV would re-include every
    // populated field on every run (most rows have SOMETHING populated),
    // making the "unchanged" count meaningless and bumping updatedAt on
    // every re-import even when nothing really changed.
    const patch: MergePlanUpdate["patch"] = {}
    if (row.roleType && row.roleType !== match.roleType) patch.roleType = row.roleType
    if (row.sector && row.sector !== match.sector) patch.sector = row.sector
    if (row.channel && row.channel !== match.channel) patch.channel = row.channel
    if (row.fitScore !== undefined && row.fitScore !== match.fitScore) patch.fitScore = row.fitScore
    if (row.fitVerdict && row.fitVerdict !== match.fitVerdict) patch.fitVerdict = row.fitVerdict
    if (row.authorizationSignal && row.authorizationSignal !== match.authorizationSignal) {
      patch.authorizationSignal = row.authorizationSignal
    }
    if (row.contactPerson && row.contactPerson !== match.contactPerson) {
      patch.contactPerson = row.contactPerson
    }
    if (row.source && row.source !== match.source) patch.source = row.source

    const newNotes = (row.notes ?? []).filter((n) => !hasNote(match.notes, n))
    const newFiles = (row.files ?? []).filter((f) => !hasFile(match.files, f))

    return {
      action: "update",
      id: match.id,
      company: match.company,
      role: match.role,
      statusChange: row.status !== match.status ? row.status : undefined,
      patch,
      newNotes,
      newFiles,
    }
  })
}
