import type { CandidateProfile } from "../profileTypes"

/**
 * Weak-bullet detection over the profile's experience descriptions.
 *
 * DETECTION ONLY. This flags bullets with a mechanical weakness a reader can
 * act on; it does not rewrite them, and it does not judge whether the
 * writing is good. Rewriting needs a language model and would send CV
 * content off-device, which is a separate decision (see docs/BACKLOG.md
 * 3.2) rather than something to slip in here.
 *
 * The two checks below are the ones that are genuinely mechanical:
 *
 *  - Duty phrasing. "Responsible for X" describes the job that existed;
 *    "Did X, producing Y" describes what the person actually changed. This
 *    is a real, checkable difference, not a style preference.
 *  - No quantification. A bullet with no number in it cannot tell a reader
 *    how big, how fast, or how much. Not every bullet needs one — hence a
 *    flag, not an error.
 */

/** Openings that describe a remit rather than an action taken. Matched at
 *  the start of a bullet only: "responsible" appearing mid-sentence is
 *  usually a legitimate word. */
const DUTY_OPENERS = [
  "responsible for",
  "responsibilities included",
  "duties included",
  "tasked with",
  "in charge of",
  "helped with",
  "assisted with",
  "worked on",
  "involved in",
  "participated in",
]

/** Verbs that describe presence rather than contribution. */
const WEAK_VERBS = ["managed", "handled", "supported", "maintained", "oversaw"]

export type BulletIssue = "duty_phrasing" | "no_quantification" | "weak_verb"

export interface BulletFinding {
  /** Which experience entry it came from, so the UI can point at it. */
  entryId: string
  company: string
  title: string
  text: string
  issues: BulletIssue[]
}

export const BULLET_ISSUE_LABELS: Record<BulletIssue, string> = {
  duty_phrasing: "Describes the remit, not what you did",
  no_quantification: "No number — scale or impact is invisible",
  weak_verb: "Weak opening verb",
}

/** Splits a description into bullets. Handles both real bullet characters
 *  and the far more common case of one-per-line, which is what both the
 *  resume and LinkedIn importers produce. */
export function splitBullets(description: string): string[] {
  return description
    .split(/\r?\n|(?:^|\s)[•·▪-]\s+/)
    .map((line) => line.replace(/^[\s•·▪-]+/, "").trim())
    .filter((line) => line.length > 0)
}

/** Any digit counts, including those inside "3x", "$1M" and "40%" — the
 *  point is whether a reader can see magnitude, not the unit used. */
function hasQuantification(text: string): boolean {
  return /\d/.test(text)
}

function startsWithAny(lowered: string, phrases: string[]): boolean {
  return phrases.some((p) => lowered.startsWith(p))
}

export function analyseBullet(text: string): BulletIssue[] {
  const issues: BulletIssue[] = []
  const lowered = text.toLowerCase().trim()

  if (startsWithAny(lowered, DUTY_OPENERS)) issues.push("duty_phrasing")
  // Only when it is not already flagged as duty phrasing — reporting both
  // for "Responsible for managing X" is two names for one problem.
  else if (WEAK_VERBS.some((v) => lowered.startsWith(v))) issues.push("weak_verb")

  if (!hasQuantification(text)) issues.push("no_quantification")

  return issues
}

/**
 * Every bullet in the profile that has at least one issue.
 *
 * Very short fragments are skipped: a three-word line is usually a heading
 * or a stray artefact of extraction, and flagging it for having no number
 * would be noise the reader has to learn to ignore — which is how a check
 * like this stops being read at all.
 */
export function analyseProfileBullets(profile: CandidateProfile): BulletFinding[] {
  const findings: BulletFinding[] = []

  for (const entry of profile.experience) {
    for (const text of splitBullets(entry.description ?? "")) {
      if (text.split(/\s+/).length < 4) continue
      const issues = analyseBullet(text)
      if (issues.length === 0) continue
      findings.push({
        entryId: entry.id,
        company: entry.company,
        title: entry.title,
        text,
        issues,
      })
    }
  }

  return findings
}

export interface BulletSummary {
  total: number
  withIssues: number
  quantified: number
}

/** Counts, deliberately, rather than a "bullet quality score". */
export function summariseBullets(profile: CandidateProfile): BulletSummary {
  let total = 0
  let quantified = 0

  for (const entry of profile.experience) {
    for (const text of splitBullets(entry.description ?? "")) {
      if (text.split(/\s+/).length < 4) continue
      total++
      if (hasQuantification(text)) quantified++
    }
  }

  return { total, quantified, withIssues: analyseProfileBullets(profile).length }
}
