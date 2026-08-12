import { rate, type Rate } from "./metrics"
import type { Application, FileKind } from "./types"

/**
 * Application-materials analysis for the CV & Cover Letters tab. Works
 * entirely off Application.files, which holds filenames only — jobtrack
 * never stores or syncs document bytes, so nothing here reads a document's
 * contents. That bounds what can honestly be reported: coverage and reuse
 * are computable from filenames; "is this CV actually tailored to the
 * posting" is not, and is deliberately not claimed.
 */

/**
 * Applications that were actually submitted. A draft legitimately has no CV
 * or cover letter yet, so counting drafts as "missing documents" would
 * manufacture a to-do list out of work that hasn't started — every figure
 * below is scoped to this set rather than to all applications.
 */
export function submittedApplications(apps: Application[]): Application[] {
  return apps.filter((a) => a.stageHistory.some((h) => h.status === "applied"))
}

function hasKind(app: Application, kind: FileKind): boolean {
  return app.files.some((f) => f.kind === kind && f.filename.trim() !== "")
}

export interface DocumentCoverage {
  submitted: number
  cv: Rate
  coverLetter: Rate
  both: Rate
}

export function documentCoverage(apps: Application[]): DocumentCoverage {
  const submitted = submittedApplications(apps)
  const total = submitted.length
  return {
    submitted: total,
    cv: rate(submitted.filter((a) => hasKind(a, "cv")).length, total),
    coverLetter: rate(submitted.filter((a) => hasKind(a, "cover_letter")).length, total),
    both: rate(
      submitted.filter((a) => hasKind(a, "cv") && hasKind(a, "cover_letter")).length,
      total,
    ),
  }
}

export interface MissingDocuments {
  application: Application
  missing: FileKind[]
}

/** Submitted applications with no CV and/or no cover letter recorded. */
export function applicationsMissingDocuments(apps: Application[]): MissingDocuments[] {
  return submittedApplications(apps)
    .map((application) => {
      const missing: FileKind[] = []
      if (!hasKind(application, "cv")) missing.push("cv")
      if (!hasKind(application, "cover_letter")) missing.push("cover_letter")
      return { application, missing }
    })
    .filter((entry) => entry.missing.length > 0)
}

export interface ReusedDocument {
  filename: string
  kind: FileKind
  applications: Application[]
}

/**
 * Documents sent to more than one application, most-reused first.
 *
 * Reuse is a signal, not a verdict: one strong base CV across several
 * near-identical roles is a legitimate strategy, and this cannot see whether
 * the content was tailored. What it does show is the shape of the reuse — a
 * single file spanning many unrelated companies is worth a second look,
 * which is the most an honest filename-only analysis can say.
 *
 * Matching is case-insensitive per kind, so "CV_Acme.pdf" and "cv_acme.pdf"
 * count as the same document.
 */
export function reusedDocuments(apps: Application[]): ReusedDocument[] {
  const byKey = new Map<string, ReusedDocument>()

  for (const app of apps) {
    for (const file of app.files) {
      const filename = file.filename.trim()
      if (!filename) continue
      const key = `${file.kind}::${filename.toLowerCase()}`
      const existing = byKey.get(key)
      if (existing) {
        existing.applications.push(app)
      } else {
        byKey.set(key, { filename, kind: file.kind, applications: [app] })
      }
    }
  }

  return Array.from(byKey.values())
    .filter((doc) => doc.applications.length > 1)
    .sort((a, b) => b.applications.length - a.applications.length)
}

/** Whether the user has recorded any document filename at all. Drives an
 *  honest empty state: zero coverage because nothing was ever recorded is a
 *  different situation from zero coverage across real applications, and
 *  showing "0%" for the former reads as a failure that hasn't happened. */
export function hasAnyRecordedDocument(apps: Application[]): boolean {
  return apps.some((a) => a.files.some((f) => f.filename.trim() !== ""))
}
