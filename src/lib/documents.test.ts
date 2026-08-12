import { describe, expect, test } from "vitest"

import {
  applicationsMissingDocuments,
  documentCoverage,
  hasAnyRecordedDocument,
  reusedDocuments,
  submittedApplications,
} from "./documents"
import type { Application, FileRef, StageEvent } from "./types"

function app(overrides: Partial<Application> = {}): Application {
  const stageHistory: StageEvent[] = overrides.stageHistory ?? [
    { status: "applied", at: "2026-07-01T00:00:00.000Z" },
  ]
  return {
    id: crypto.randomUUID(),
    company: "Acme",
    role: "Engineer",
    status: "applied",
    stageHistory,
    notes: [],
    files: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

const cv = (filename: string): FileRef => ({ kind: "cv", filename })
const cover = (filename: string): FileRef => ({ kind: "cover_letter", filename })

describe("submittedApplications", () => {
  test("excludes drafts that never reached applied", () => {
    const draft = app({ status: "draft", stageHistory: [{ status: "draft", at: "2026-07-01T00:00:00.000Z" }] })
    const submitted = app()
    expect(submittedApplications([draft, submitted])).toEqual([submitted])
  })

  test("includes an application that moved past applied", () => {
    const interviewing = app({
      status: "interview",
      stageHistory: [
        { status: "applied", at: "2026-07-01T00:00:00.000Z" },
        { status: "interview", at: "2026-07-10T00:00:00.000Z" },
      ],
    })
    expect(submittedApplications([interviewing])).toHaveLength(1)
  })
})

describe("documentCoverage", () => {
  test("reports coverage over submitted applications only", () => {
    const apps = [
      app({ files: [cv("a.pdf"), cover("a-cover.pdf")] }),
      app({ files: [cv("b.pdf")] }),
      app({ files: [] }),
      // A draft with no documents must not drag coverage down — it isn't
      // expected to have any yet.
      app({ status: "draft", stageHistory: [{ status: "draft", at: "2026-07-01T00:00:00.000Z" }] }),
    ]

    const coverage = documentCoverage(apps)

    expect(coverage.submitted).toBe(3)
    expect(coverage.cv).toMatchObject({ count: 2, of: 3 })
    expect(coverage.coverLetter).toMatchObject({ count: 1, of: 3 })
    expect(coverage.both).toMatchObject({ count: 1, of: 3 })
  })

  test("a whitespace-only filename does not count as a recorded document", () => {
    const coverage = documentCoverage([app({ files: [cv("   ")] })])
    expect(coverage.cv).toMatchObject({ count: 0, of: 1 })
  })

  test("pct is null rather than 0 when there is nothing submitted to divide by", () => {
    const coverage = documentCoverage([])
    expect(coverage.submitted).toBe(0)
    expect(coverage.cv.pct).toBeNull()
  })
})

describe("applicationsMissingDocuments", () => {
  test("lists exactly which kinds are missing, and skips fully-covered applications", () => {
    const complete = app({ company: "Complete", files: [cv("a.pdf"), cover("a-cover.pdf")] })
    const noCover = app({ company: "NoCover", files: [cv("b.pdf")] })
    const neither = app({ company: "Neither" })

    const result = applicationsMissingDocuments([complete, noCover, neither])

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.application.company === "NoCover")!.missing).toEqual([
      "cover_letter",
    ])
    expect(result.find((r) => r.application.company === "Neither")!.missing).toEqual([
      "cv",
      "cover_letter",
    ])
  })

  test("never flags a draft", () => {
    const draft = app({ status: "draft", stageHistory: [{ status: "draft", at: "2026-07-01T00:00:00.000Z" }] })
    expect(applicationsMissingDocuments([draft])).toEqual([])
  })
})

describe("reusedDocuments", () => {
  test("groups a document used across applications, most-reused first", () => {
    const apps = [
      app({ company: "One", files: [cv("generic.pdf")] }),
      app({ company: "Two", files: [cv("generic.pdf")] }),
      app({ company: "Three", files: [cv("generic.pdf"), cover("shared-cover.pdf")] }),
      app({ company: "Four", files: [cover("shared-cover.pdf")] }),
    ]

    const result = reusedDocuments(apps)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ filename: "generic.pdf", kind: "cv" })
    expect(result[0].applications).toHaveLength(3)
    expect(result[1]).toMatchObject({ filename: "shared-cover.pdf", kind: "cover_letter" })
    expect(result[1].applications).toHaveLength(2)
  })

  test("a document used only once is not reuse", () => {
    expect(reusedDocuments([app({ files: [cv("tailored.pdf")] })])).toEqual([])
  })

  test("matches case-insensitively but reports the first-seen casing", () => {
    const result = reusedDocuments([
      app({ files: [cv("CV_Acme.pdf")] }),
      app({ files: [cv("cv_acme.pdf")] }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].filename).toBe("CV_Acme.pdf")
  })

  test("the same filename under different kinds is not conflated", () => {
    const result = reusedDocuments([
      app({ files: [cv("doc.pdf")] }),
      app({ files: [cover("doc.pdf")] }),
    ])
    expect(result).toEqual([])
  })
})

describe("hasAnyRecordedDocument", () => {
  test("distinguishes 'nothing recorded yet' from 'recorded but incomplete'", () => {
    expect(hasAnyRecordedDocument([app(), app()])).toBe(false)
    expect(hasAnyRecordedDocument([app(), app({ files: [cv("a.pdf")] })])).toBe(true)
  })

  test("a whitespace-only filename is not a recorded document", () => {
    expect(hasAnyRecordedDocument([app({ files: [cv("  ")] })])).toBe(false)
  })
})
