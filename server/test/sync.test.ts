import { describe, expect, test } from "vitest"

import { mergeSyncState } from "../src/sync.ts"
import type { Application, CandidateProfile, SyncState } from "../src/schema.ts"

function app(id: string, updatedAt: string, overrides: Partial<Application> = {}): Application {
  return {
    id,
    company: "Acme",
    role: "Engineer",
    status: "applied",
    stageHistory: [{ status: "applied", at: updatedAt }],
    notes: [],
    files: [],
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  }
}

function profile(updatedAt: string, name: string): CandidateProfile {
  return { name, experience: [], education: [], skills: [], updatedAt }
}

function state(overrides: Partial<SyncState> = {}): SyncState {
  return { applications: [], profile: null, deletions: [], ...overrides }
}

const EARLY = "2026-08-01T00:00:00.000Z"
const LATE = "2026-08-10T00:00:00.000Z"

describe("mergeSyncState — applications", () => {
  test("takes the record with the later updatedAt, regardless of side", () => {
    const merged = mergeSyncState(
      state({ applications: [app("a", LATE, { company: "Server wins" })] }),
      state({ applications: [app("a", EARLY, { company: "stale client" })] }),
    )
    expect(merged.applications).toHaveLength(1)
    expect(merged.applications[0].company).toBe("Server wins")

    const other = mergeSyncState(
      state({ applications: [app("a", EARLY)] }),
      state({ applications: [app("a", LATE, { company: "Client wins" })] }),
    )
    expect(other.applications[0].company).toBe("Client wins")
  })

  test("unions records that exist on only one side", () => {
    const merged = mergeSyncState(
      state({ applications: [app("server-only", EARLY)] }),
      state({ applications: [app("client-only", EARLY)] }),
    )
    expect(merged.applications.map((a) => a.id)).toEqual(["client-only", "server-only"])
  })

  test("a record absent from the client payload is NOT treated as deleted", () => {
    // The core reason tombstones exist. A client that has never seen a
    // record simply omits it; without this rule, first sync from a new
    // device would wipe the server.
    const merged = mergeSyncState(
      state({ applications: [app("a", EARLY), app("b", EARLY)] }),
      state({ applications: [app("a", LATE)] }),
    )
    expect(merged.applications.map((a) => a.id)).toEqual(["a", "b"])
  })
})

describe("mergeSyncState — deletions", () => {
  test("a client tombstone removes the record from the server", () => {
    const merged = mergeSyncState(
      state({ applications: [app("a", EARLY)] }),
      state({ deletions: [{ id: "a", deletedAt: LATE }] }),
    )
    expect(merged.applications).toEqual([])
    expect(merged.deletions).toEqual([{ id: "a", deletedAt: LATE }])
  })

  test("the tombstone is retained so a third device also applies the delete", () => {
    const afterFirstSync = mergeSyncState(
      state({ applications: [app("a", EARLY)] }),
      state({ deletions: [{ id: "a", deletedAt: LATE }] }),
    )
    // A device that still holds its own stale copy syncs next.
    const afterSecondSync = mergeSyncState(afterFirstSync, state({ applications: [app("a", EARLY)] }))
    expect(afterSecondSync.applications).toEqual([])
  })

  test("an edit strictly newer than the delete resurrects the record and drops the tombstone", () => {
    const merged = mergeSyncState(
      state({ deletions: [{ id: "a", deletedAt: EARLY }] }),
      state({ applications: [app("a", LATE, { company: "edited after deleting" })] }),
    )
    expect(merged.applications).toHaveLength(1)
    expect(merged.applications[0].company).toBe("edited after deleting")
    expect(merged.deletions).toEqual([])
  })

  test("a tie between an edit and a delete resolves to the delete", () => {
    const merged = mergeSyncState(
      state({ deletions: [{ id: "a", deletedAt: LATE }] }),
      state({ applications: [app("a", LATE)] }),
    )
    expect(merged.applications).toEqual([])
  })

  test("keeps the later of two tombstones for the same id", () => {
    const merged = mergeSyncState(
      state({ deletions: [{ id: "a", deletedAt: EARLY }] }),
      state({ deletions: [{ id: "a", deletedAt: LATE }] }),
    )
    expect(merged.deletions).toEqual([{ id: "a", deletedAt: LATE }])
  })
})

describe("mergeSyncState — profile", () => {
  test("a client with no profile never erases the server's", () => {
    const merged = mergeSyncState(state({ profile: profile(EARLY, "Server") }), state())
    expect(merged.profile?.name).toBe("Server")
  })

  test("the later profile wins in each direction", () => {
    expect(
      mergeSyncState(
        state({ profile: profile(LATE, "Server") }),
        state({ profile: profile(EARLY, "Client") }),
      ).profile?.name,
    ).toBe("Server")

    expect(
      mergeSyncState(
        state({ profile: profile(EARLY, "Server") }),
        state({ profile: profile(LATE, "Client") }),
      ).profile?.name,
    ).toBe("Client")
  })

  test("a first profile from the client is adopted when the server has none", () => {
    const merged = mergeSyncState(state(), state({ profile: profile(EARLY, "Client") }))
    expect(merged.profile?.name).toBe("Client")
  })
})

describe("mergeSyncState — idempotence", () => {
  test("re-syncing an unchanged client is a no-op", () => {
    const client = state({
      applications: [app("a", EARLY), app("b", LATE)],
      profile: profile(EARLY, "Me"),
      deletions: [{ id: "gone", deletedAt: EARLY }],
    })
    const first = mergeSyncState(state(), client)
    const second = mergeSyncState(first, client)
    expect(second).toEqual(first)
  })
})
