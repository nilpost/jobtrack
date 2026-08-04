import Papa from "papaparse"
import type { Application } from "./types"

/**
 * jobtrack's own CSV shape — a full-fidelity round-trip format. Scalar
 * fields are plain columns; the nested arrays (stageHistory, notes, files)
 * are JSON-encoded into their own columns so export -> import reconstructs
 * an application exactly, not just its current snapshot.
 *
 * This is deliberately NOT job-agent's 13-column tracker format — that's a
 * separate import adapter (Phase 2), because job-agent's flat CSV has no
 * stage-history concept to round-trip against.
 */
export const CSV_COLUMNS = [
  "id",
  "company",
  "role",
  "roleType",
  "sector",
  "channel",
  "status",
  "fitScore",
  "fitVerdict",
  "authorizationSignal",
  "contactPerson",
  "source",
  "notes",
  "stageHistory",
  "files",
  "createdAt",
  "updatedAt",
] as const

export function exportToCSV(apps: Application[]): string {
  const rows = apps.map((a) => ({
    id: a.id,
    company: a.company,
    role: a.role,
    roleType: a.roleType ?? "",
    sector: a.sector ?? "",
    channel: a.channel ?? "",
    status: a.status,
    fitScore: a.fitScore ?? "",
    fitVerdict: a.fitVerdict ?? "",
    authorizationSignal: a.authorizationSignal ?? "",
    contactPerson: a.contactPerson ?? "",
    source: a.source ?? "",
    notes: JSON.stringify(a.notes),
    stageHistory: JSON.stringify(a.stageHistory),
    files: JSON.stringify(a.files),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }))
  return Papa.unparse({ fields: [...CSV_COLUMNS], data: rows })
}

export interface ParseResult {
  applications: Application[]
  errors: string[]
}

function safeJSONArray<T>(value: string | undefined, fallback: T[]): T[] {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

/** Parses jobtrack's own exported CSV format. Never throws on a malformed
 *  row — collects errors and skips that row, so one bad line doesn't fail
 *  the whole import. */
export function parseJobtrackCSV(csvText: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  const applications: Application[] = []
  const errors: string[] = [...result.errors.map((e) => `Row ${e.row}: ${e.message}`)]

  result.data.forEach((row, i) => {
    if (!row.id || !row.company || !row.role || !row.status) {
      errors.push(`Row ${i + 1}: missing required field (id, company, role, or status) — skipped`)
      return
    }
    applications.push({
      id: row.id,
      company: row.company,
      role: row.role,
      roleType: row.roleType || undefined,
      sector: row.sector || undefined,
      channel: row.channel || undefined,
      status: row.status as Application["status"],
      fitScore: row.fitScore ? Number(row.fitScore) : undefined,
      fitVerdict: row.fitVerdict || undefined,
      authorizationSignal: (row.authorizationSignal || undefined) as
        | Application["authorizationSignal"]
        | undefined,
      contactPerson: row.contactPerson || undefined,
      source: row.source || undefined,
      notes: safeJSONArray(row.notes, []),
      stageHistory: safeJSONArray(row.stageHistory, [
        { status: row.status as Application["status"], at: row.createdAt || new Date().toISOString() },
      ]),
      files: safeJSONArray(row.files, []),
      createdAt: row.createdAt || new Date().toISOString(),
      updatedAt: row.updatedAt || new Date().toISOString(),
    })
  })

  return { applications, errors }
}

export function downloadCSV(csvText: string, filename = "jobtrack-export.csv") {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
