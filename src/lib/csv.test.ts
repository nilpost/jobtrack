import { describe, expect, test } from "vitest"
import { exportToCSV, parseJobtrackCSV } from "./csv"
import type { Application } from "./types"

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    company: "Acme & Co",
    role: "Senior Engineer",
    roleType: "Full-time",
    sector: "Robotics",
    channel: "Referral",
    status: "interview",
    fitScore: 85,
    fitVerdict: "Strong Fit",
    authorizationSignal: "pr_or_citizen_required",
    contactPerson: "Jane Doe",
    source: "https://example.com/jobs/1",
    notes: [{ at: "2026-08-01T00:00:00.000Z", text: "Great call, felt strong." }],
    stageHistory: [
      { status: "applied", at: "2026-07-01T00:00:00.000Z" },
      { status: "interview", at: "2026-07-15T00:00:00.000Z", note: "Phone screen" },
    ],
    files: [{ kind: "cv", filename: "main_acme_engineer.pdf" }],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  }
}

describe("CSV round-trip", () => {
  test("export -> import reconstructs every field exactly", () => {
    const original = [makeApp()]
    const csv = exportToCSV(original)
    const { applications, errors } = parseJobtrackCSV(csv)

    expect(errors).toEqual([])
    expect(applications).toHaveLength(1)
    expect(applications[0]).toEqual(original[0])
  })

  test("survives a company name containing a comma and quotes", () => {
    const original = [
      makeApp({ company: 'Acme, "The Best" Robotics Inc.', notes: [{ at: "2026-08-01T00:00:00.000Z", text: 'Said "yes" — great, fit.' }] }),
    ]
    const csv = exportToCSV(original)
    const { applications, errors } = parseJobtrackCSV(csv)

    expect(errors).toEqual([])
    expect(applications[0].company).toBe(original[0].company)
    expect(applications[0].notes[0].text).toBe(original[0].notes[0].text)
  })

  test("round-trips multiple applications with different statuses", () => {
    const original = [
      makeApp({ id: "a", company: "Alpha", status: "draft", stageHistory: [{ status: "draft", at: "2026-08-01T00:00:00.000Z" }] }),
      makeApp({ id: "b", company: "Beta", status: "rejected" }),
      makeApp({ id: "c", company: "Gamma", status: "hired", fitScore: undefined, authorizationSignal: undefined }),
    ]
    const csv = exportToCSV(original)
    const { applications, errors } = parseJobtrackCSV(csv)

    expect(errors).toEqual([])
    expect(applications).toHaveLength(3)
    expect(applications.map((a) => a.company)).toEqual(["Alpha", "Beta", "Gamma"])
    expect(applications[2].fitScore).toBeUndefined()
    expect(applications[2].authorizationSignal).toBeUndefined()
  })

  test("a row missing a required field is skipped with an error, not thrown", () => {
    const badCSV = "id,company,role,status\n,MissingId,Role,applied\nvalid-id,Valid Co,Role,applied\n"
    const { applications, errors } = parseJobtrackCSV(badCSV)

    expect(applications).toHaveLength(1)
    expect(applications[0].company).toBe("Valid Co")
    expect(errors.length).toBeGreaterThan(0)
  })

  test("malformed JSON in a nested column falls back instead of throwing", () => {
    const csv =
      "id,company,role,status,notes,stageHistory,files\n" +
      "x,Acme,Role,applied,not-json,also-not-json,nope\n"
    const { applications, errors } = parseJobtrackCSV(csv)

    expect(errors).toEqual([])
    expect(applications).toHaveLength(1)
    expect(applications[0].notes).toEqual([])
    expect(applications[0].files).toEqual([])
    // stageHistory falls back to a single synthetic entry at the row's status
    expect(applications[0].stageHistory).toEqual([{ status: "applied", at: expect.any(String) }])
  })
})
