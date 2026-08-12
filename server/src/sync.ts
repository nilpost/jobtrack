import type { Application, Deletion, SyncState } from "./schema.ts"

/**
 * The merge. Deliberately pure — no database, no request context — because
 * this is the only part of the sync path with real logic, and it is where a
 * mistake silently loses a user's data rather than throwing.
 *
 * Model: last-write-wins per record, keyed on `updatedAt`. There is no
 * conflict UI and no vector clocks. For the actual use case — one person,
 * two or three devices, edits rarely overlapping to the second — LWW is
 * right-sized, and the alternative (surfacing conflicts) would cost the user
 * more attention than it saves.
 *
 * The one thing LWW gets wrong on its own is deletion: with only "latest
 * record wins", a record deleted on a laptop is simply absent from that
 * client's payload, so the phone's copy looks newer and the deletion
 * silently undoes itself on the next sync. Tombstones (`deletions`) exist to
 * make a delete an explicit, dated fact that can win a comparison, rather
 * than an absence that can't.
 */

function newer(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime()
}

function atLeastAsRecent(a: string, b: string): boolean {
  return new Date(a).getTime() >= new Date(b).getTime()
}

/** Latest tombstone per id across both sides. */
function mergeDeletions(server: Deletion[], client: Deletion[]): Map<string, Deletion> {
  const byId = new Map<string, Deletion>()
  for (const d of [...server, ...client]) {
    const existing = byId.get(d.id)
    if (!existing || newer(d.deletedAt, existing.deletedAt)) byId.set(d.id, d)
  }
  return byId
}

/** Latest record per id across both sides. */
function mergeApplications(server: Application[], client: Application[]): Map<string, Application> {
  const byId = new Map<string, Application>()
  for (const app of [...server, ...client]) {
    const existing = byId.get(app.id)
    if (!existing || newer(app.updatedAt, existing.updatedAt)) byId.set(app.id, app)
  }
  return byId
}

export function mergeSyncState(server: SyncState, client: SyncState): SyncState {
  const deletions = mergeDeletions(server.deletions, client.deletions)
  const applications = mergeApplications(server.applications, client.applications)

  const survivors: Application[] = []
  for (const app of applications.values()) {
    const tombstone = deletions.get(app.id)
    if (!tombstone) {
      survivors.push(app)
      continue
    }
    // An edit strictly newer than the delete resurrects the record: the user
    // touched it after deleting it elsewhere, so the edit is the later
    // intent. Ties go to the delete — a record saved and deleted in the same
    // millisecond is far more likely a delete of that same save than a
    // genuine re-creation.
    if (newer(app.updatedAt, tombstone.deletedAt)) {
      survivors.push(app)
      deletions.delete(app.id)
    }
  }

  // Profile is a singleton, so it is a straight timestamp comparison rather
  // than a per-record merge. A client that has never had a profile sends
  // null, which must not erase one that exists on the server.
  let profile = server.profile
  if (client.profile && (!server.profile || atLeastAsRecent(client.profile.updatedAt, server.profile.updatedAt))) {
    profile = client.profile
  }

  return {
    applications: survivors.sort((a, b) => a.id.localeCompare(b.id)),
    profile,
    // Tombstones are retained indefinitely rather than pruned on a time
    // window. They are tiny (an id and a timestamp), and any expiry short
    // enough to matter for storage would be long enough to resurrect records
    // on a device that had been offline past the cutoff.
    deletions: Array.from(deletions.values()).sort((a, b) => a.id.localeCompare(b.id)),
  }
}
