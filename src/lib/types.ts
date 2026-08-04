/**
 * jobtrack's own data model. Not a mirror of any external tool's schema
 * (e.g. job-agent's tracker CSV) — those are import sources that map into
 * this shape once, not a format this app is bound to. See lib/importers/.
 */

export const STATUSES = [
  "draft",
  "applied",
  "interview",
  "offer",
  "hired",
  "rejected",
  "no_response",
  "offer_declined",
  "withdrawn",
] as const

export type Status = (typeof STATUSES)[number]

/** Statuses that still represent an open, in-flight application. */
export const OPEN_STATUSES: readonly Status[] = [
  "draft",
  "applied",
  "interview",
  "offer",
]

/** Terminal statuses — an application here will not change again. */
export const CLOSED_STATUSES: readonly Status[] = [
  "hired",
  "rejected",
  "no_response",
  "offer_declined",
  "withdrawn",
]

export const AUTHORIZATION_SIGNALS = [
  "requires_sponsorship",
  "pr_or_citizen_required",
  "domestic_only_implied",
  "silent",
] as const

export type AuthorizationSignal = (typeof AUTHORIZATION_SIGNALS)[number]

export interface StageEvent {
  status: Status
  at: string // ISO 8601
  note?: string
}

export interface NoteEntry {
  at: string // ISO 8601
  text: string
}

export type FileKind = "cv" | "cover_letter"

export interface FileRef {
  kind: FileKind
  /** Filename only — jobtrack never stores or syncs document bytes. */
  filename: string
}

export interface Application {
  id: string
  company: string
  role: string
  roleType?: string
  sector?: string
  channel?: string
  status: Status
  /** Full timeline, not just the current status — what makes time-in-stage
   *  and funnel metrics possible without reconstructing dates from notes. */
  stageHistory: StageEvent[]
  fitScore?: number // 0-100
  fitVerdict?: string
  authorizationSignal?: AuthorizationSignal
  contactPerson?: string
  source?: string // posting URL
  notes: NoteEntry[]
  files: FileRef[]
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}

export type NewApplication = Omit<
  Application,
  "id" | "stageHistory" | "notes" | "files" | "createdAt" | "updatedAt"
> & {
  stageHistory?: StageEvent[]
  notes?: NoteEntry[]
  files?: FileRef[]
}

export const STATUS_LABELS: Record<Status, string> = {
  draft: "Draft",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  no_response: "No response",
  offer_declined: "Offer declined",
  withdrawn: "Withdrawn",
}

/** Kanban board columns. Closed outcomes collapse into one column so the
 *  board stays scannable — the full breakdown lives in the metrics panel. */
export const BOARD_COLUMNS = [
  "draft",
  "applied",
  "interview",
  "offer",
  "hired",
  "closed",
] as const

export type BoardColumn = (typeof BOARD_COLUMNS)[number]

export function columnForStatus(status: Status): BoardColumn {
  if (status === "hired") return "hired"
  if (CLOSED_STATUSES.includes(status)) return "closed"
  return status as BoardColumn
}

export const BOARD_COLUMN_LABELS: Record<BoardColumn, string> = {
  draft: "Draft",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  closed: "Closed",
}
