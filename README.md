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

Early build — Phase 1 (local-first core) in progress. See
[docs/self-hosting.md](docs/self-hosting.md) once it exists for the optional
sync-backend setup, and the plan this was built from for the full roadmap.

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
- Resume PDF / DOCX (heuristic extraction into an editable review form —
  never auto-committed without you checking it) — not yet built
- LinkedIn's own "Get a copy of your data" export — not yet built

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

Before committing, run the repo guard (also runs in CI):

```bash
npm run guard
```

It fails loudly if a personal-data file pattern (a real resume, a LinkedIn
export, a `job_search_tracker.csv`) is about to be committed, or if
`.gitignore`'s protections against that are weakened. See
[tools/guard-repo.mjs](tools/guard-repo.mjs).

## License

MIT — see [LICENSE](LICENSE).
