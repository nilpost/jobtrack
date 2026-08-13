# jobtrack

A local-first, self-hostable Kanban tracker for a job search. Open it and it
works — no account, no backend, no setup. Data lives in your browser.

## Why

Every job-application tracker either lives in a spreadsheet you have to
maintain by hand, or in a SaaS product that owns your data. jobtrack is
neither: it's a Kanban board (Applied → Interview → Offer → Hired/Rejected)
with real metrics — response rate, time-in-stage, funnel conversion — that
runs entirely client-side by default, and optionally syncs to a backend you
control if you want it on more than one device.

## Status

Usable, and live at **https://jobs.postiusgroup.com**. All three tabs are
built and working entirely in the browser:

- **Pipeline** — Kanban board (drag to change stage) plus metrics: funnel,
  response and rejection rates, median time to first response, follow-up
  queue, and response rate segmented by channel and by the posting's stated
  work-authorization requirement.
- **CV & Cover Letters** — document coverage across submitted applications,
  which ones are missing materials, and which documents are reused across
  several companies. Filenames only; jobtrack never stores or uploads the
  documents themselves.
- **Career Showcase** — a profile built from a resume or LinkedIn export.

Optional, off by default, and not required for any of the above:

- **Sync across devices** — a small self-hostable server ([server/](server))
  built on Node + SQLite. Point the app at it and your applications and
  profile follow you between devices; ignore it and nothing changes. See
  [docs/self-hosting.md](docs/self-hosting.md).
- **Sign in with LinkedIn** — identity only (name, email, photo). It cannot
  import work history; LinkedIn does not expose that to third-party apps.
  The data-export importer above is the path for that, and the UI says so.

Both need credentials you supply. See [docs/STATUS.md](docs/STATUS.md) for
where things stand in detail.

## How syncing works

**You do not need this.** By default jobtrack keeps everything in your
browser's IndexedDB and never sends it anywhere — no account, no server, no
network calls with your data in them. Skip this section entirely and the app
works.

Sync exists for one problem: using jobtrack on more than one device.

**The model.** There is no jobtrack cloud to sign up for. You run the small
server in [server/](server) yourself — a container with a SQLite file, on a
NAS or any box you control. The app then pushes and pulls against it. Your
data goes to your machine and nowhere else.

**How devices agree.** Each device keeps its own IndexedDB copy and
reconciles with the server on sync. Applications are merged per record, most
recent write wins. Deletes are explicit: deleting a record writes a
tombstone, so the deletion propagates instead of the record reappearing from
another device on the next sync. A brand-new device that has nothing yet
cannot wipe the server by syncing an empty payload — that case is guarded
and tested.

**How it is secured.** Two options, either one sufficient:

- **A shared token** — generated when you set up the server and pasted into
  the app once per device. Sent as a bearer token, stored in that browser's
  `localStorage`. It is per-device configuration, not data: it never appears
  in an export, a CSV, or the sync payload.
- **Sign in with Google** — for when copying a secret between devices is the
  annoying part. Only addresses you list in `GOOGLE_ALLOWED_EMAILS` on your
  server may sync; anyone can create a Google account, so identity alone
  grants nothing, and the server refuses to start if Google is enabled
  without that list.

Still deliberately single-user: one deployment holds one person's data, and
signing in replaces the token rather than partitioning storage.

The separate **"Sign in with LinkedIn"** is identity only and grants no sync
access at all.

Setup instructions: [docs/self-hosting.md](docs/self-hosting.md).

## Import sources

- Manual entry
- CSV round-trip in jobtrack's own format (Export CSV → edit → Import CSV)
- **[job-agent](https://github.com/MadsLorentzen/ai-job-search)** — reads
  `job_search_tracker.csv` directly (job-agent's own 13-column format, not
  jobtrack's) and optionally `job_scraper/seen_jobs.json` for fit score,
  verdict, and work-authorization signal. One-way and re-runnable: nothing is
  written back to job-agent's files, and re-importing the same data is a
  no-op. Matching is case-insensitive on company + role; job-agent's status
  always wins on conflict (it's the system of record for what actually
  happened), but every other field is additive — a blank cell in the CSV
  never erases something you entered locally in jobtrack, and notes/files
  merge rather than replace. See [src/lib/importers/jobAgent.ts](src/lib/importers/jobAgent.ts).
- **Resume PDF / DOCX** — real text-layer extraction (pdf.js for PDF, mammoth
  for DOCX — not OCR; resumes are generated documents with a real text layer)
  feeding a heuristic section/contact parser. Populates the Career Showcase
  tab's profile via an editable review form — nothing is ever saved without
  you checking it first. See [src/lib/importers/resume.ts](src/lib/importers/resume.ts).
- **LinkedIn's own "Get a copy of your data" export** — the .zip of CSVs
  LinkedIn lets any user download from their own account (Settings & Privacy
  → Data privacy → Get a copy of your data). Reads whichever of
  `Profile.csv`, `Email Addresses.csv`, `Positions.csv`, `Education.csv`,
  and `Skills.csv` are present in the export (LinkedIn's "Basic" and
  "Complete" tiers ship different file sets) and reports what's missing
  rather than failing the whole import. Feeds the same review form as the
  resume importer above. See
  [src/lib/importers/linkedin.ts](src/lib/importers/linkedin.ts).

jobtrack does not scrape or automate LinkedIn, and "Sign in with LinkedIn"
(when it ships) is identity-only — LinkedIn's own API does not expose work
history to third-party apps, so the data-export file above is the only real
path to importing it, and jobtrack is upfront about that in the UI rather
than pretending otherwise.

## Development

```bash
npm install
npm run dev
```

The sync server is a separate package with its own dependencies:

```bash
npm run test:all
```

That runs the frontend suite and the server suite. `npm test` alone is the
frontend only — `server/` is excluded from the root vitest config on
purpose, since it would otherwise fail for anyone who has not installed
inside `server/`.

Before committing, run the repo guard (also runs in CI):

```bash
npm run guard
```

It fails loudly if a personal-data file pattern (a real resume, a LinkedIn
export, a `job_search_tracker.csv`, a sync server's `.sqlite` database) is
about to be committed, or if `.gitignore`'s protections against that are
weakened. See [tools/guard-repo.mjs](tools/guard-repo.mjs).

## License

MIT — see [LICENSE](LICENSE).
