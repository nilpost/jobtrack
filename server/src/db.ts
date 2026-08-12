import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

import type { Application, CandidateProfile, Deletion, SyncState } from "./schema.ts"

/**
 * SQLite via node:sqlite — Node's built-in driver, so the container needs no
 * native module compilation and the whole server has three runtime
 * dependencies. For a single-user personal tracker (dozens to hundreds of
 * rows) this is far past sufficient.
 *
 * Records are stored as JSON blobs keyed by id rather than shredded into
 * columns. The server never queries inside an application — it only merges
 * whole records by timestamp — so columns would buy nothing and would need a
 * migration every time the client's model gained a field.
 */

export class SyncStore {
  private db: DatabaseSync

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    // WAL keeps a read during a write from blocking, which matters as soon
    // as two devices sync at once.
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deletions (
        id TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `)
  }

  read(): SyncState {
    const applications = this.db
      .prepare("SELECT data FROM applications")
      .all()
      .map((row) => JSON.parse(String(row.data)) as Application)

    const deletions = this.db
      .prepare("SELECT id, deleted_at FROM deletions")
      .all()
      .map((row) => ({ id: String(row.id), deletedAt: String(row.deleted_at) }) as Deletion)

    const profileRow = this.db.prepare("SELECT data FROM profile WHERE id = 1").get()
    const profile = profileRow ? (JSON.parse(String(profileRow.data)) as CandidateProfile) : null

    return { applications, profile, deletions }
  }

  /**
   * Replaces stored state with the merge result, in one transaction. The
   * merge already decided what survives, so a partial write here — half the
   * applications replaced, tombstones not yet applied — would leave the
   * database in a state no merge ever produced.
   */
  write(state: SyncState): void {
    this.db.exec("BEGIN")
    try {
      this.db.exec("DELETE FROM applications")
      const insertApp = this.db.prepare(
        "INSERT INTO applications (id, updated_at, data) VALUES (?, ?, ?)",
      )
      for (const app of state.applications) {
        insertApp.run(app.id, app.updatedAt, JSON.stringify(app))
      }

      this.db.exec("DELETE FROM deletions")
      const insertDeletion = this.db.prepare("INSERT INTO deletions (id, deleted_at) VALUES (?, ?)")
      for (const d of state.deletions) {
        insertDeletion.run(d.id, d.deletedAt)
      }

      this.db.exec("DELETE FROM profile")
      if (state.profile) {
        this.db
          .prepare("INSERT INTO profile (id, updated_at, data) VALUES (1, ?, ?)")
          .run(state.profile.updatedAt, JSON.stringify(state.profile))
      }
      this.db.exec("COMMIT")
    } catch (err) {
      this.db.exec("ROLLBACK")
      throw err
    }
  }

  close(): void {
    this.db.close()
  }
}
