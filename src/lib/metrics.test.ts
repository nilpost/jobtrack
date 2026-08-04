import { describe, expect, test } from "vitest"
import {
  computeFunnel,
  daysToFirstResponse,
  medianDaysToFirstResponse,
  rejectionRate,
  responseRate,
  statsByAuthorizationSignal,
  statsByChannel,
} from "./metrics"
import type { Application } from "./types"

/** A status implies a realistic stageHistory path — real applications always
 *  keep these in sync (setStatus appends on every transition), so a bare
 *  `status` override here must produce a consistent path too, or these
 *  fixtures would test a state createApplication/setStatus can't produce. */
function stageHistoryFor(status: Application["status"]): Application["stageHistory"] {
  const path: Application["status"][] = status === "draft" ? ["draft"] : ["applied"]
  if (status !== "draft" && status !== "applied") path.push(status)
  return path.map((s, i) => ({ status: s, at: `2026-07-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }))
}

function app(overrides: Partial<Application> = {}): Application {
  const status = overrides.status ?? "applied"
  return {
    id: crypto.randomUUID(),
    company: "Acme",
    role: "Engineer",
    status,
    stageHistory: stageHistoryFor(status),
    notes: [],
    files: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("computeFunnel", () => {
  test("counts applications that ever reached each stage, cumulative", () => {
    const apps = [
      app({
        stageHistory: [
          { status: "applied", at: "2026-07-01T00:00:00.000Z" },
          { status: "interview", at: "2026-07-10T00:00:00.000Z" },
          { status: "offer", at: "2026-07-20T00:00:00.000Z" },
          { status: "hired", at: "2026-08-01T00:00:00.000Z" },
        ],
      }),
      app({ stageHistory: [{ status: "applied", at: "2026-07-01T00:00:00.000Z" }] }),
      app({
        status: "draft",
        stageHistory: [{ status: "draft", at: "2026-07-01T00:00:00.000Z" }],
      }),
    ]
    const funnel = computeFunnel(apps)
    expect(funnel).toEqual([
      { status: "applied", label: "Applied", count: 2 },
      { status: "interview", label: "Interview", count: 1 },
      { status: "offer", label: "Offer", count: 1 },
      { status: "hired", label: "Hired", count: 1 },
    ])
  })

  test("an empty list produces a zeroed funnel, not an error", () => {
    expect(computeFunnel([])).toEqual([
      { status: "applied", label: "Applied", count: 0 },
      { status: "interview", label: "Interview", count: 0 },
      { status: "offer", label: "Offer", count: 0 },
      { status: "hired", label: "Hired", count: 0 },
    ])
  })
})

describe("responseRate", () => {
  test("counts only applications that moved past 'applied'", () => {
    const apps = [
      app({ status: "interview" }), // responded
      app({ status: "applied" }), // no response yet
      app({ status: "rejected" }), // responded (rejection is a response)
      app({ status: "draft" }), // never applied — excluded from the denominator
    ]
    const rate = responseRate(apps)
    expect(rate).toEqual({ count: 2, of: 3, pct: expect.closeTo(66.7, 1) })
  })

  test("zero applications yields a null pct, not division by zero", () => {
    expect(responseRate([])).toEqual({ count: 0, of: 0, pct: null })
  })
})

describe("rejectionRate", () => {
  test("rejection rate is scoped to applied applications only", () => {
    const apps = [app({ status: "rejected" }), app({ status: "interview" }), app({ status: "draft" })]
    expect(rejectionRate(apps)).toEqual({ count: 1, of: 2, pct: 50 })
  })
})

describe("daysToFirstResponse / medianDaysToFirstResponse", () => {
  test("measures from the applied event to the next status change", () => {
    const a = app({
      stageHistory: [
        { status: "applied", at: "2026-07-01T00:00:00.000Z" },
        { status: "interview", at: "2026-07-11T00:00:00.000Z" },
      ],
    })
    expect(daysToFirstResponse(a)).toBe(10)
  })

  test("no response yet -> null, not zero", () => {
    const a = app({ stageHistory: [{ status: "applied", at: "2026-07-01T00:00:00.000Z" }] })
    expect(daysToFirstResponse(a)).toBeNull()
  })

  test("median ignores applications with no response", () => {
    const apps = [
      app({
        stageHistory: [
          { status: "applied", at: "2026-07-01T00:00:00.000Z" },
          { status: "rejected", at: "2026-07-05T00:00:00.000Z" },
        ],
      }),
      app({
        stageHistory: [
          { status: "applied", at: "2026-07-01T00:00:00.000Z" },
          { status: "interview", at: "2026-07-11T00:00:00.000Z" },
        ],
      }),
      app({ stageHistory: [{ status: "applied", at: "2026-07-01T00:00:00.000Z" }] }), // no response
    ]
    expect(medianDaysToFirstResponse(apps)).toBe(7) // median of [4, 10]
  })
})

describe("statsByChannel", () => {
  test("groups by channel and computes response rate per group", () => {
    const apps = [
      app({
        channel: "LinkedIn",
        status: "interview",
        stageHistory: [
          { status: "applied", at: "2026-07-01T00:00:00.000Z" },
          { status: "interview", at: "2026-07-05T00:00:00.000Z" },
        ],
      }),
      app({ channel: "LinkedIn", status: "applied" }),
      app({
        channel: "Referral",
        status: "hired",
        stageHistory: [
          { status: "applied", at: "2026-07-01T00:00:00.000Z" },
          { status: "hired", at: "2026-07-20T00:00:00.000Z" },
        ],
      }),
    ]
    const stats = statsByChannel(apps)
    const linkedin = stats.find((s) => s.channel === "LinkedIn")
    const referral = stats.find((s) => s.channel === "Referral")
    expect(linkedin).toEqual({ channel: "LinkedIn", total: 2, responseRate: { count: 1, of: 2, pct: 50 } })
    expect(referral).toEqual({ channel: "Referral", total: 1, responseRate: { count: 1, of: 1, pct: 100 } })
  })

  test("an application with no channel groups under 'Unknown'", () => {
    const stats = statsByChannel([app({ channel: undefined })])
    expect(stats[0].channel).toBe("Unknown")
  })
})

describe("statsByAuthorizationSignal — the core PR-edge instrumentation", () => {
  test("segments response rate by the posting's work-authorization signal", () => {
    const apps = [
      app({
        authorizationSignal: "pr_or_citizen_required",
        status: "interview",
        stageHistory: [
          { status: "applied", at: "2026-07-01T00:00:00.000Z" },
          { status: "interview", at: "2026-07-05T00:00:00.000Z" },
        ],
      }),
      app({
        authorizationSignal: "pr_or_citizen_required",
        status: "offer",
        stageHistory: [
          { status: "applied", at: "2026-07-01T00:00:00.000Z" },
          { status: "offer", at: "2026-07-15T00:00:00.000Z" },
        ],
      }),
      app({ authorizationSignal: "requires_sponsorship", status: "applied" }),
      app({
        authorizationSignal: "silent",
        status: "rejected",
        stageHistory: [
          { status: "applied", at: "2026-07-01T00:00:00.000Z" },
          { status: "rejected", at: "2026-07-10T00:00:00.000Z" },
        ],
      }),
    ]
    const stats = statsByAuthorizationSignal(apps)
    const prRequired = stats.find((s) => s.signal === "pr_or_citizen_required")
    expect(prRequired).toEqual({
      signal: "pr_or_citizen_required",
      total: 2,
      responseRate: { count: 2, of: 2, pct: 100 },
    })
  })

  test("an application with no recorded signal groups under 'unrecorded', not silently dropped", () => {
    const stats = statsByAuthorizationSignal([app({ authorizationSignal: undefined })])
    expect(stats).toHaveLength(1)
    expect(stats[0].signal).toBe("unrecorded")
  })
})
