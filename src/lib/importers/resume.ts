import * as pdfjsLib from "pdfjs-dist"
import mammoth from "mammoth"

import type { CandidateProfile, EducationEntry, ExperienceEntry } from "../profileTypes"

// Vite-compatible worker URL resolution, same pattern as FinPal's ScanReceipt.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href

/**
 * Heuristic resume parsing. Everything below produces a DRAFT — a starting
 * point for a human to review and correct in an editable form, never
 * something silently saved as-is. Resume layouts vary too much across
 * templates, languages, and tools for fully automatic structured extraction
 * to be honest about its own accuracy; this is upfront about that rather
 * than pretending otherwise.
 */

// ---------------------------------------------------------------------------
// Text extraction — real text-layer extraction, not OCR. Resumes are
// generated documents (LaTeX, Word, Google Docs export) with a real text
// layer, the same assumption job-agent's own ATS-parseability check makes
// (/apply Step 5d, via pdftotext). OCR would be the wrong tool here.
// ---------------------------------------------------------------------------

/**
 * pdf.js's getTextContent() returns text items with position data but no
 * explicit line breaks. Line breaks are reconstructed from Y-coordinate
 * jumps between consecutive items — the standard technique for this API.
 * A jump under ~2pt is treated as the same line (handles items pdf.js
 * splits mid-word for kerning); nothing about this is exact, but it is
 * good enough for line-based section/header detection below.
 */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const lines: string[] = []
    let currentLine = ""
    let lastY: number | null = null

    for (const item of content.items) {
      if (!("str" in item)) continue
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(currentLine)
        currentLine = ""
      }
      currentLine += item.str
      lastY = y
    }
    if (currentLine) lines.push(currentLine)
    pageTexts.push(lines.join("\n"))
  }

  return pageTexts.join("\n\n")
}

/** mammoth already returns paragraph-separated plain text, which is what
 *  the line-based heuristics below need. */
export async function extractDocxText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

export async function extractResumeText(file: File): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(file)
  }
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  ) {
    return extractDocxText(file)
  }
  throw new Error(`Unsupported file type: ${file.name}. Only .pdf and .docx are supported.`)
}

// ---------------------------------------------------------------------------
// Contact info — regex on the whole text. The most reliable part of this
// module, since email/phone/URL formats are genuinely regular across
// resume layouts, unlike section structure.
// ---------------------------------------------------------------------------

export interface ContactInfo {
  name?: string
  email?: string
  phone?: string
  linkedin?: string
  github?: string
  portfolio?: string
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/
const LINKEDIN_RE = /linkedin\.com\/in\/[\w-]+/i
const GITHUB_RE = /github\.com\/[\w-]+/i

export function extractContactInfo(text: string): ContactInfo {
  const info: ContactInfo = {}

  const email = EMAIL_RE.exec(text)
  if (email) info.email = email[0]

  // Phone numbers and date ranges both look like digit runs — require at
  // least 9 digits total so a "2020-2023" style range doesn't get misread
  // as a phone number.
  const phone = PHONE_RE.exec(text)
  if (phone && (phone[0].match(/\d/g)?.length ?? 0) >= 9) {
    info.phone = phone[0].trim()
  }

  const linkedin = LINKEDIN_RE.exec(text)
  if (linkedin) info.linkedin = `https://${linkedin[0]}`

  const github = GITHUB_RE.exec(text)
  if (github) info.github = `https://${github[0]}`

  // Name: the resume convention of leading with the candidate's name on
  // line one is common enough to guess from, but only when the line looks
  // like a name (short, no digits, not itself an email/section header) —
  // an unconfident guess left blank is better than a wrong one the user
  // has to notice and undo.
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0)
  if (
    firstLine &&
    firstLine.length <= 60 &&
    !/\d/.test(firstLine) &&
    !firstLine.includes("@") &&
    !SECTION_PATTERNS.summary.test(firstLine) &&
    !SECTION_PATTERNS.experience.test(firstLine)
  ) {
    info.name = firstLine
  }

  return info
}

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

export type SectionName = "summary" | "experience" | "education" | "skills"

const SECTION_PATTERNS: Record<SectionName, RegExp> = {
  summary: /^(professional\s+|career\s+)?(summary|profile|objective|about)\s*:?\s*$/i,
  experience:
    /^(professional\s+|work\s+|relevant\s+)?(experience|employment(\s+history)?|career\s+history)\s*:?\s*$/i,
  education: /^education(\s+(and|&)\s+training)?\s*:?\s*$/i,
  skills: /^(technical\s+|core\s+|key\s+)?(skills|competencies)\s*:?\s*$/i,
}

export function splitIntoSections(text: string): Partial<Record<SectionName, string>> {
  const lines = text.split("\n")
  const sections: Partial<Record<SectionName, string[]>> = {}
  let current: SectionName | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const matchedSection = (Object.keys(SECTION_PATTERNS) as SectionName[]).find((name) =>
      SECTION_PATTERNS[name].test(line),
    )
    if (matchedSection) {
      current = matchedSection
      sections[current] ??= []
      continue
    }
    if (current) sections[current]!.push(rawLine)
  }

  const result: Partial<Record<SectionName, string>> = {}
  for (const name of Object.keys(sections) as SectionName[]) {
    const text = sections[name]!.join("\n").trim()
    if (text) result[name] = text
  }
  return result
}

// ---------------------------------------------------------------------------
// Experience / education entries — block-split on blank lines, then a
// best-effort split of the header line into two fields using common
// separators. Genuinely ambiguous (is "Title, Company" or "Company, Title"
// the convention this resume uses?), so this is a starting guess for the
// review form, not a claim of correctness — documented in the UI, not just
// in this comment.
// ---------------------------------------------------------------------------

const HEADER_SEPARATOR = /\s*(?:,|–|—|\|)\s*| at | @ /i

const DATE_RANGE_RE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?\d{4}\s*[-–—to]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(present|current|\d{4})/i

function splitBlocks(sectionText: string): string[][] {
  const blocks: string[][] = []
  let current: string[] = []
  for (const rawLine of sectionText.split("\n")) {
    const line = rawLine.trim()
    if (!line) {
      if (current.length > 0) blocks.push(current)
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length > 0) blocks.push(current)
  return blocks
}

function splitHeaderLine(headerLine: string): { first: string; second: string } {
  const parts = headerLine.split(HEADER_SEPARATOR)
  if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
    return { first: parts[0].trim(), second: parts.slice(1).join(" ").trim() }
  }
  return { first: headerLine.trim(), second: "" }
}

/**
 * Finds the date range AND how many leading lines it consumed, so the
 * caller can start the description/remainder after it — extracting a date
 * without excluding its source line would leave it duplicated verbatim in
 * whatever comes next.
 */
function extractDatesAndConsumed(block: string[]): { dates: string; consumed: number } {
  // Most common convention: header line, then a dedicated dates line. If
  // line 1 is a date range on its own, consume the whole line.
  if (block[1] && DATE_RANGE_RE.test(block[1])) {
    const match = DATE_RANGE_RE.exec(block[1])!
    return { dates: match[0].trim(), consumed: 2 }
  }
  // Less common: dates embedded in the header line itself — the header
  // line is already consumed by title/company parsing, so this doesn't
  // need to consume an extra line beyond it.
  const headerMatch = DATE_RANGE_RE.exec(block[0])
  if (headerMatch) {
    return { dates: headerMatch[0].trim(), consumed: 1 }
  }
  return { dates: "", consumed: 1 }
}

export function parseExperienceEntries(sectionText: string | undefined): ExperienceEntry[] {
  if (!sectionText) return []
  return splitBlocks(sectionText).map((block) => {
    // Convention assumed: "Title, Company" (title first) — matches the
    // moderncv template job-agent itself uses. Wrong for resumes that lead
    // with the company; the review form is where that gets corrected.
    const { first, second } = splitHeaderLine(block[0])
    const { dates, consumed } = extractDatesAndConsumed(block)
    return {
      id: crypto.randomUUID(),
      title: first,
      company: second,
      dates,
      description: block.slice(consumed).join("\n").trim(),
    }
  })
}

export function parseEducationEntries(sectionText: string | undefined): EducationEntry[] {
  if (!sectionText) return []
  return splitBlocks(sectionText).map((block) => {
    // Convention assumed: "Qualification, Institution" (degree first).
    const { first, second } = splitHeaderLine(block[0])
    return {
      id: crypto.randomUUID(),
      qualification: first,
      institution: second,
      dates: extractDatesAndConsumed(block).dates,
    }
  })
}

// ---------------------------------------------------------------------------
// Skills — split on common delimiters, clean, dedupe case-insensitively
// while keeping first-seen casing.
// ---------------------------------------------------------------------------

export function parseSkills(sectionText: string | undefined): string[] {
  if (!sectionText) return []
  const tokens = sectionText
    .split(/[\n,;•·|]/)
    .map((t) => t.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const result: string[] = []
  for (const token of tokens) {
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(token)
  }
  return result
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type ResumeDraft = Omit<CandidateProfile, "updatedAt">

export function parseResumeText(text: string): ResumeDraft {
  const contact = extractContactInfo(text)
  const sections = splitIntoSections(text)

  return {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    linkedin: contact.linkedin,
    github: contact.github,
    summary: sections.summary,
    experience: parseExperienceEntries(sections.experience),
    education: parseEducationEntries(sections.education),
    skills: parseSkills(sections.skills),
  }
}
