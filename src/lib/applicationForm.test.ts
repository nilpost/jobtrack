import { describe, expect, test } from "vitest"

import { toApplicationPatch, toFileRefs, toFormValues } from "./applicationForm"
import type { ApplicationFormValues } from "./schema"
import type { Application } from "./types"

function values(overrides: Partial<ApplicationFormValues> = {}): ApplicationFormValues {
  return {
    company: "Acme",
    role: "Engineer",
    roleType: "",
    sector: "",
    channel: "",
    status: "applied",
    fitScore: undefined,
    authorizationSignal: undefined,
    contactPerson: "",
    source: "",
    cvFile: "",
    coverLetterFile: "",
    ...overrides,
  }
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
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

describe("toApplicationPatch", () => {
  /**
   * Regression test for a real bug: the edit dialog used to pass the whole
   * form (status included) to updateApplication, which writes raw fields.
   * The card moved but stageHistory never recorded the transition, silently
   * corrupting the funnel, response rate, and time-in-stage — all of which
   * read stageHistory, not the current status.
   */
  test("never includes status — that must go through setStatus", () => {
    const patch = toApplicationPatch(values({ status: "interview" }))
    expect(patch).not.toHaveProperty("status")
  })

  test("never leaks form-only fields onto the stored row", () => {
    const patch = toApplicationPatch(values({ cvFile: "cv.pdf", coverLetterFile: "cover.pdf" }))
    expect(patch).not.toHaveProperty("cvFile")
    expect(patch).not.toHaveProperty("coverLetterFile")
    expect(patch.files).toEqual([
      { kind: "cv", filename: "cv.pdf" },
      { kind: "cover_letter", filename: "cover.pdf" },
    ])
  })
})

describe("toFileRefs", () => {
  test("blank and whitespace-only inputs produce no file entry", () => {
    expect(toFileRefs(values({ cvFile: "", coverLetterFile: "   " }))).toEqual([])
  })

  test("trims surrounding whitespace off a filename", () => {
    expect(toFileRefs(values({ cvFile: "  cv.pdf  " }))).toEqual([
      { kind: "cv", filename: "cv.pdf" },
    ])
  })
})

describe("toFormValues", () => {
  test("round-trips an application's files back into the flat form fields", () => {
    const form = toFormValues(
      application({
        files: [
          { kind: "cover_letter", filename: "cover.pdf" },
          { kind: "cv", filename: "cv.pdf" },
        ],
      }),
    )
    expect(form.cvFile).toBe("cv.pdf")
    expect(form.coverLetterFile).toBe("cover.pdf")
  })

  test("a new application defaults to draft with empty document fields", () => {
    const form = toFormValues(undefined)
    expect(form.status).toBe("draft")
    expect(form.cvFile).toBe("")
    expect(form.coverLetterFile).toBe("")
  })
})
