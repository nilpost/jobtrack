/**
 * The candidate profile jobtrack's Career Showcase tab renders. Separate
 * from Application (the Pipeline's own model) — a resume describes a
 * person, not a job application, and there is exactly one of these per
 * browser, not many.
 *
 * Populated either by hand or via the resume PDF/DOCX importer
 * (lib/importers/resume.ts). The importer only ever produces a DRAFT of
 * this shape for a human to review and edit — nothing here is ever
 * silently auto-filled from an extraction.
 */

export interface ExperienceEntry {
  id: string
  company: string
  title: string
  /** Free text, e.g. "Jan 2020 – Present" — deliberately not decomposed
   *  into start/end fields. Resume date formats vary too much across
   *  layouts for that to be reliable; the user reads and fixes free text
   *  far more easily than they'd fix a wrongly-split date pair. */
  dates: string
  description: string
}

export interface EducationEntry {
  id: string
  institution: string
  qualification: string
  dates: string
}

export interface CandidateProfile {
  name?: string
  email?: string
  phone?: string
  location?: string
  linkedin?: string
  github?: string
  portfolio?: string
  summary?: string
  experience: ExperienceEntry[]
  education: EducationEntry[]
  skills: string[]
  updatedAt: string
}

export function emptyProfile(): CandidateProfile {
  return {
    experience: [],
    education: [],
    skills: [],
    updatedAt: new Date().toISOString(),
  }
}
