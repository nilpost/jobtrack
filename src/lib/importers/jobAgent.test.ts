import { describe, expect, test } from "vitest"
import {
  enrichFromSeenJobs,
  mergeImport,
  parseJobAgentDate,
  parseJobAgentNotes,
  parseJobAgentTracker,
  toNewApplications,
  type JobAgentSeenJobsFile,
} from "./jobAgent"
import type { Application } from "../types"

const HEADER =
  "date,company,sector,role,role_type,channel,status,contact_person,fit_rating,notes,cv_file,cover_letter_file,source"

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n")
}

function existingApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "existing-1",
    company: "Acme",
    role: "Engineer",
    status: "applied",
    stageHistory: [{ status: "applied", at: "2026-07-01T00:00:00.000Z" }],
    notes: [],
    files: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("parseJobAgentDate", () => {
  test("a bare year becomes January 1st of that year", () => {
    const errors: string[] = []
    expect(parseJobAgentDate("2025", errors, "ctx")).toBe("2025-01-01T00:00:00.000Z")
    expect(errors).toEqual([])
  })

  test("a full date parses normally", () => {
    const errors: string[] = []
    const result = parseJobAgentDate("2026-07-15", errors, "ctx")
    expect(result.startsWith("2026-07-15")).toBe(true)
    expect(errors).toEqual([])
  })

  test("an unparseable date falls back to today and reports a warning, never throws", () => {
    const errors: string[] = []
    expect(() => parseJobAgentDate("not-a-date", errors, "ctx")).not.toThrow()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("unparseable date")
  })

  test("an empty date is silent — no warning for a genuinely blank cell", () => {
    const errors: string[] = []
    parseJobAgentDate("", errors, "ctx")
    expect(errors).toEqual([])
  })
})

describe("parseJobAgentNotes", () => {
  test("splits multi-line notes and extracts a leading date per line", () => {
    const notes = parseJobAgentNotes(
      "2026-07-01: applied via referral\nfollowed up 2026-07-10",
      "2026-06-01T00:00:00.000Z",
    )
    expect(notes).toHaveLength(2)
    expect(notes[0].text).toBe("applied via referral")
    expect(notes[0].at.startsWith("2026-07-01")).toBe(true)
    // second line has no leading YYYY-MM-DD token, so it keeps the full
    // line as text and falls back to the row's own date
    expect(notes[1].text).toBe("followed up 2026-07-10")
    expect(notes[1].at).toBe("2026-06-01T00:00:00.000Z")
  })

  test("a single undated line imports as one note at the fallback date", () => {
    const notes = parseJobAgentNotes("great first call", "2026-06-01T00:00:00.000Z")
    expect(notes).toEqual([{ at: "2026-06-01T00:00:00.000Z", text: "great first call" }])
  })

  test("an empty cell produces no notes", () => {
    expect(parseJobAgentNotes("", "2026-06-01T00:00:00.000Z")).toEqual([])
    expect(parseJobAgentNotes("   ", "2026-06-01T00:00:00.000Z")).toEqual([])
  })
})

describe("parseJobAgentTracker", () => {
  test("parses a well-formed row end to end", () => {
    const { rows, errors } = parseJobAgentTracker(
      csv(
        '2026-07-01,Acme Corp,Robotics,Senior Engineer,Full-time,Referral,interview,Jane Doe,85,great call,cv/main_acme_engineer.tex,cover_letters/cover_acme_engineer.tex,https://example.com/jobs/1',
      ),
    )
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.company).toBe("Acme Corp")
    expect(row.role).toBe("Senior Engineer")
    expect(row.roleType).toBe("Full-time")
    expect(row.sector).toBe("Robotics")
    expect(row.channel).toBe("Referral")
    expect(row.status).toBe("interview")
    expect(row.fitScore).toBe(85)
    expect(row.contactPerson).toBe("Jane Doe")
    expect(row.source).toBe("https://example.com/jobs/1")
    expect(row.files).toEqual([
      { kind: "cv", filename: "cv/main_acme_engineer.tex" },
      { kind: "cover_letter", filename: "cover_letters/cover_acme_engineer.tex" },
    ])
    // status "interview" implies a prior "applied" event
    expect(row.stageHistory.map((h) => h.status)).toEqual(["applied", "interview"])
  })

  test("maps job-agent's 'drafted' to jobtrack's 'draft'", () => {
    const { rows } = parseJobAgentTracker(
      csv("2026-07-01,Acme,,Engineer,,,drafted,,,,,,"),
    )
    expect(rows[0].status).toBe("draft")
    expect(rows[0].stageHistory).toEqual([{ status: "draft", at: rows[0].appliedDate }])
  })

  test("an empty fit_rating stays undefined, not 0", () => {
    const { rows } = parseJobAgentTracker(csv("2026-07-01,Acme,,Engineer,,,applied,,,,,,"))
    expect(rows[0].fitScore).toBeUndefined()
  })

  test("a row missing company or role is skipped with an error, not thrown", () => {
    const { rows, errors } = parseJobAgentTracker(
      csv(
        "2026-07-01,,,Missing Company,,,applied,,,,,,",
        "2026-07-01,Valid Co,,Engineer,,,applied,,,,,,",
      ),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].company).toBe("Valid Co")
    expect(errors.length).toBeGreaterThan(0)
  })

  test("an unrecognized status imports as 'applied' with a warning rather than throwing", () => {
    const { rows, errors } = parseJobAgentTracker(
      csv("2026-07-01,Acme,,Engineer,,,some_future_status,,,,,,"),
    )
    expect(rows[0].status).toBe("applied")
    expect(errors.some((e) => e.includes("unrecognized status"))).toBe(true)
  })

  test("empty optional cells become undefined, never empty strings", () => {
    const { rows } = parseJobAgentTracker(csv("2026-07-01,Acme,,Engineer,,,applied,,,,,,"))
    expect(rows[0].sector).toBeUndefined()
    expect(rows[0].channel).toBeUndefined()
    expect(rows[0].contactPerson).toBeUndefined()
    expect(rows[0].source).toBeUndefined()
  })
})

describe("enrichFromSeenJobs", () => {
  test("matches by company+role and fills fit score, verdict, and authorization signal", () => {
    const { rows } = parseJobAgentTracker(csv("2026-07-01,Acme Corp,,Senior Engineer,,,applied,,,,,,"))
    const seenJobs: JobAgentSeenJobsFile = {
      seen: {
        "some-key": {
          company: "Acme Corp",
          title: "Senior Engineer",
          rank_score: 82,
          rank_verdict: "Strong Fit",
          authorization_signal: "pr_or_citizen_required",
        },
      },
    }
    const enriched = enrichFromSeenJobs(rows, seenJobs)
    expect(enriched[0].fitScore).toBe(82)
    expect(enriched[0].fitVerdict).toBe("Strong Fit")
    expect(enriched[0].authorizationSignal).toBe("pr_or_citizen_required")
  })

  test("maps job-agent's 'requires_sponsorship_stated' to jobtrack's 'requires_sponsorship'", () => {
    const { rows } = parseJobAgentTracker(csv("2026-07-01,Acme,,Engineer,,,applied,,,,,,"))
    const seenJobs: JobAgentSeenJobsFile = {
      seen: { k: { company: "Acme", title: "Engineer", authorization_signal: "requires_sponsorship_stated" } },
    }
    const enriched = enrichFromSeenJobs(rows, seenJobs)
    expect(enriched[0].authorizationSignal).toBe("requires_sponsorship")
  })

  test("matching is case-insensitive on company and role", () => {
    const { rows } = parseJobAgentTracker(csv("2026-07-01,ACME corp,,senior ENGINEER,,,applied,,,,,,"))
    const seenJobs: JobAgentSeenJobsFile = {
      seen: { k: { company: "Acme Corp", title: "Senior Engineer", rank_score: 90 } },
    }
    expect(enrichFromSeenJobs(rows, seenJobs)[0].fitScore).toBe(90)
  })

  test("a tracker-provided fit_rating is never overwritten by seen_jobs.json", () => {
    const { rows } = parseJobAgentTracker(csv("2026-07-01,Acme,,Engineer,,,applied,,60,,,,"))
    const seenJobs: JobAgentSeenJobsFile = {
      seen: { k: { company: "Acme", title: "Engineer", rank_score: 95 } },
    }
    expect(enrichFromSeenJobs(rows, seenJobs)[0].fitScore).toBe(60)
  })

  test("no match, no seen_jobs.json, or an entry missing company/title — all pass through unchanged", () => {
    const { rows } = parseJobAgentTracker(csv("2026-07-01,Acme,,Engineer,,,applied,,,,,,"))
    expect(enrichFromSeenJobs(rows, undefined)).toEqual(rows)
    expect(enrichFromSeenJobs(rows, { seen: {} })).toEqual(rows)
    expect(enrichFromSeenJobs(rows, { seen: { k: { rank_score: 99 } } })).toEqual(rows)
  })
})

describe("mergeImport", () => {
  test("a job-agent row with no existing match plans a create", () => {
    const rows = toNewApplications(parseJobAgentTracker(csv("2026-07-01,New Co,,Engineer,,,applied,,,,,,")).rows)
    const plan = mergeImport([], rows)
    expect(plan).toHaveLength(1)
    expect(plan[0].action).toBe("create")
  })

  test("a matching row (case-insensitive, company+role) plans an update, not a duplicate create", () => {
    const existing = [existingApp({ company: "Acme", role: "Engineer" })]
    const rows = toNewApplications(
      parseJobAgentTracker(csv("2026-07-01,acme,,engineer,,,applied,,,,,,")).rows,
    )
    const plan = mergeImport(existing, rows)
    expect(plan).toHaveLength(1)
    expect(plan[0].action).toBe("update")
  })

  test("tracker status wins: an existing local status is overwritten via statusChange", () => {
    const existing = [existingApp({ status: "applied" })]
    const rows = toNewApplications(
      parseJobAgentTracker(csv("2026-07-01,Acme,,Engineer,,,interview,,,,,,")).rows,
    )
    const plan = mergeImport(existing, rows)
    expect(plan[0]).toMatchObject({ action: "update", statusChange: "interview" })
  })

  test("re-importing identical data is a true no-op: empty patch, no statusChange, no new notes/files", () => {
    const existing = [
      existingApp({
        status: "interview",
        notes: [{ at: "2026-07-01T00:00:00.000Z", text: "great call" }],
        sector: "Robotics",
        channel: "Referral",
        fitScore: 80,
      }),
    ]
    const rows = toNewApplications(
      parseJobAgentTracker(
        csv("2026-07-01,Acme,Robotics,Engineer,,Referral,interview,,80,2026-07-01: great call,,,"),
      ).rows,
    )
    const plan = mergeImport(existing, rows)
    const update = plan[0] as Extract<(typeof plan)[number], { action: "update" }>
    expect(update.statusChange).toBeUndefined()
    expect(update.newNotes).toEqual([])
    expect(update.newFiles).toEqual([])
    // The regression this guards: a field landing in `patch` merely because
    // the import HAS a value, rather than because it DIFFERS from the
    // existing one, would make every re-import look like a change.
    expect(update.patch).toEqual({})
  })

  test("a field only lands in the patch when it actually differs from the existing value", () => {
    const existing = [existingApp({ sector: "Robotics", channel: "Referral" })]
    const rows = toNewApplications(
      // sector matches existing (no patch entry expected); channel differs (patch entry expected)
      parseJobAgentTracker(csv("2026-07-01,Acme,Robotics,Engineer,,LinkedIn,applied,,,,,,")).rows,
    )
    const plan = mergeImport(existing, rows)
    const update = plan[0] as Extract<(typeof plan)[number], { action: "update" }>
    expect(update.patch).toEqual({ channel: "LinkedIn" })
  })

  test("a blank imported field never erases existing local data", () => {
    const existing = [existingApp({ sector: "Manually entered sector", contactPerson: "Jane" })]
    const rows = toNewApplications(
      parseJobAgentTracker(csv("2026-07-01,Acme,,Engineer,,,applied,,,,,,")).rows, // sector, contact blank
    )
    const plan = mergeImport(existing, rows)
    const update = plan[0] as Extract<(typeof plan)[number], { action: "update" }>
    expect(update.patch.sector).toBeUndefined()
    expect(update.patch.contactPerson).toBeUndefined()
  })

  test("a genuinely new note is queued to append, not to replace existing notes", () => {
    const existing = [existingApp({ notes: [{ at: "2026-07-01T00:00:00.000Z", text: "old note" }] })]
    const rows = toNewApplications(
      parseJobAgentTracker(csv("2026-07-01,Acme,,Engineer,,,applied,,,2026-07-15: new update,,,")).rows,
    )
    const plan = mergeImport(existing, rows)
    const update = plan[0] as Extract<(typeof plan)[number], { action: "update" }>
    expect(update.newNotes).toHaveLength(1)
    expect(update.newNotes[0].text).toBe("new update")
  })

  test("a genuinely new file is queued to append, not to replace existing files", () => {
    const existing = [existingApp({ files: [{ kind: "cv", filename: "old_cv.tex" }] })]
    const rows = toNewApplications(
      parseJobAgentTracker(
        csv("2026-07-01,Acme,,Engineer,,,applied,,,,cv/new_cv.tex,cover_letters/cover.tex,"),
      ).rows,
    )
    const plan = mergeImport(existing, rows)
    const update = plan[0] as Extract<(typeof plan)[number], { action: "update" }>
    expect(update.newFiles).toEqual([
      { kind: "cv", filename: "cv/new_cv.tex" },
      { kind: "cover_letter", filename: "cover_letters/cover.tex" },
    ])
  })
})
