import JSZip from "jszip"
import Papa from "papaparse"

import type { EducationEntry, ExperienceEntry } from "../profileTypes"
import type { ResumeDraft } from "./resume"

/**
 * Parses LinkedIn's own "Get a copy of your data" export — a .zip of CSVs
 * the user downloads from LinkedIn account settings (Settings → Data
 * privacy → Get a copy of your data). This is the only real path to
 * importing LinkedIn work history: LinkedIn's self-serve OAuth product
 * returns name/email/photo only (see the "Sign in with LinkedIn" feature,
 * separate from this one) and scraping is off-limits, but the export file
 * is a mechanism LinkedIn itself provides for exactly this purpose.
 *
 * Feeds the same ProfileReviewForm the resume PDF/DOCX importer uses (see
 * resume.ts) — one review step for every import source, so nothing here is
 * ever silently saved unreviewed.
 *
 * LinkedIn ships both a "Basic" and a "Complete" export tier, and the exact
 * file set has changed over time. This adapter doesn't assume either — it
 * reads whichever of the relevant CSVs are actually present (matched
 * case-insensitively, tolerant of a nested export folder) and reports what's
 * missing rather than failing the whole import, matching job-agent's own
 * "one bad thing doesn't fail the batch" convention (see jobAgent.ts).
 */

export interface LinkedInImportResult {
  draft: ResumeDraft
  errors: string[]
}

// ---------------------------------------------------------------------------
// Zip/CSV plumbing
// ---------------------------------------------------------------------------

function findEntry(zip: JSZip, filename: string): JSZip.JSZipObject | undefined {
  const lower = filename.toLowerCase()
  return Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith(lower))
}

async function readCsv(zip: JSZip, filename: string): Promise<Record<string, string>[] | undefined> {
  const entry = findEntry(zip, filename)
  if (!entry) return undefined
  const text = await entry.async("text")
  return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data
}

/** Returns the first non-blank value across candidate column names — export
 *  column headers have drifted across LinkedIn's format revisions (e.g.
 *  "Geo Location" vs "Location"), so a single fixed key per field is too
 *  brittle. */
function cell(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = row[key]?.trim()
    if (v) return v
  }
  return undefined
}

/** LinkedIn's Started On/Finished On columns are already free text (e.g.
 *  "Jan 2020"), matching profileTypes.ts's own "dates is free text, not a
 *  parsed start/end pair" convention — this just joins the two rather than
 *  reformatting either. */
function formatDateRange(started: string | undefined, finished: string | undefined): string {
  if (!started && !finished) return ""
  return `${started ?? ""} – ${finished || "Present"}`.trim()
}

// ---------------------------------------------------------------------------
// Per-file parsing — each independent, so one missing/malformed file only
// costs that section of the profile, not the whole import.
// ---------------------------------------------------------------------------

async function parseProfile(
  zip: JSZip,
  errors: string[],
): Promise<{ name?: string; location?: string; summary?: string; portfolio?: string }> {
  const rows = await readCsv(zip, "Profile.csv")
  if (!rows || rows.length === 0) {
    errors.push("Profile.csv not found in export — name, location, and summary left blank")
    return {}
  }
  const row = rows[0]
  const name = [cell(row, "First Name"), cell(row, "Last Name")].filter(Boolean).join(" ") || undefined
  const location = cell(row, "Geo Location", "Location", "Address")
  const summary = cell(row, "Summary", "Headline")
  const websites = cell(row, "Websites")
  const portfolio = websites
    ?.split(/[\n,]/)
    .map((s) => s.trim())
    .find(Boolean)
  return { name, location, summary, portfolio }
}

async function parseEmail(zip: JSZip, errors: string[]): Promise<string | undefined> {
  const rows = await readCsv(zip, "Email Addresses.csv")
  if (!rows || rows.length === 0) {
    errors.push("Email Addresses.csv not found in export — email left blank")
    return undefined
  }
  const primary = rows.find((r) => cell(r, "Primary")?.toLowerCase() === "yes")
  const confirmed = rows.find((r) => cell(r, "Confirmed")?.toLowerCase() === "yes")
  return cell(primary ?? confirmed ?? rows[0], "Email Address")
}

async function parsePositions(zip: JSZip, errors: string[]): Promise<ExperienceEntry[]> {
  const rows = await readCsv(zip, "Positions.csv")
  if (!rows) {
    errors.push("Positions.csv not found in export — experience left empty")
    return []
  }
  return rows
    .filter((r) => cell(r, "Company Name") || cell(r, "Title"))
    .map((r) => ({
      id: crypto.randomUUID(),
      company: cell(r, "Company Name") ?? "",
      title: cell(r, "Title") ?? "",
      dates: formatDateRange(cell(r, "Started On"), cell(r, "Finished On")),
      description: cell(r, "Description") ?? "",
    }))
}

async function parseEducation(zip: JSZip, errors: string[]): Promise<EducationEntry[]> {
  const rows = await readCsv(zip, "Education.csv")
  if (!rows) {
    errors.push("Education.csv not found in export — education left empty")
    return []
  }
  return rows
    .filter((r) => cell(r, "School Name"))
    .map((r) => {
      const qualification = [cell(r, "Degree Name"), cell(r, "Field Of Study")]
        .filter(Boolean)
        .join(", ")
      return {
        id: crypto.randomUUID(),
        institution: cell(r, "School Name") ?? "",
        qualification,
        dates: formatDateRange(cell(r, "Start Date"), cell(r, "End Date")),
      }
    })
}

async function parseSkills(zip: JSZip, errors: string[]): Promise<string[]> {
  const rows = await readCsv(zip, "Skills.csv")
  if (!rows) {
    errors.push("Skills.csv not found in export — skills left empty")
    return []
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const row of rows) {
    const name = cell(row, "Name")
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    result.push(name)
  }
  return result
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Pure parsing over an already-loaded zip — kept separate from the File-
 * reading step below so this, the part that actually carries logic, is
 * fully unit-testable in plain Node/vitest against an in-memory zip. Unlike
 * resume.ts's pdf.js/mammoth extraction, JSZip has no browser-only build to
 * work around, so this doesn't need resume.ts's three-tier verification
 * split — a real zip round-trip runs directly in the unit suite.
 */
export async function parseLinkedInZip(zip: JSZip): Promise<LinkedInImportResult> {
  const errors: string[] = []

  const [profile, email, experience, education, skills] = await Promise.all([
    parseProfile(zip, errors),
    parseEmail(zip, errors),
    parsePositions(zip, errors),
    parseEducation(zip, errors),
    parseSkills(zip, errors),
  ])

  const draft: ResumeDraft = {
    name: profile.name,
    location: profile.location,
    summary: profile.summary,
    portfolio: profile.portfolio,
    email,
    experience,
    education,
    skills,
  }

  return { draft, errors }
}

/** Reads the user's uploaded export file. A file that isn't a valid zip
 *  (e.g. the user accidentally selected an unrelated file, or unzipped the
 *  export before uploading it) fails here with a message pointing at the
 *  fix, before any parsing is attempted. */
export async function loadLinkedInExport(file: File): Promise<LinkedInImportResult> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error(
      `Couldn't read "${file.name}" as a zip file. Upload the .zip LinkedIn sends you when your ` +
        `"Get a copy of your data" export is ready — don't unzip it first.`,
    )
  }
  return parseLinkedInZip(zip)
}
