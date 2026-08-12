# Status

Where jobtrack actually stands. Written so a fresh session (or a new
contributor) can pick up from the repo alone without prior context.

Last updated: 2026-08-12.

## What works today

The app is usable end-to-end with zero setup — open it, and everything below
runs client-side against IndexedDB.

| Area | State |
| --- | --- |
| Kanban board, drag-to-restage, closed-outcome prompt | Done |
| Metrics: funnel, response/rejection rate, median time to response, follow-up queue | Done |
| Segmentation by channel and by work-authorization signal | Done |
| Manual entry / edit, notes, stage history | Done |
| CSV round-trip in jobtrack's own format | Done |
| job-agent import (`job_search_tracker.csv` + `seen_jobs.json`) | Done |
| Resume PDF / DOCX import → reviewable profile draft | Done |
| LinkedIn data-export (.zip) import → reviewable profile draft | Done |
| CV & Cover Letters tab (coverage, gaps, reuse) | Done |
| Career Showcase profile view | Done |
| Sample data / demo mode | Done |

90 unit tests. `npm run typecheck`, `npm test`, `npm run guard`, and
`npm run build` all pass.

## Not built

- **"Sign in with LinkedIn" (OIDC).** Identity only — name, email, photo.
  Verified against LinkedIn's current docs that their self-serve OAuth
  product does *not* expose work history to third-party apps, so this can
  never be a data-import path; the data-export importer already covers that.
  Needs a LinkedIn developer app and a client secret, so it can't be
  completed without account access.
- **Optional self-hosted sync backend.** The app is deliberately fully
  functional without it. Would be a small REST service over jobtrack's own
  schema; IndexedDB becomes a cache when configured.
- **Deployment.** Public demo instance + a private gated instance. Requires
  live Cloudflare/DNS/secret changes, so it needs a human at the console.

## Invariants worth knowing before changing code

These are the non-obvious rules the code depends on. Breaking one tends to
fail quietly rather than loudly.

1. **Status changes must go through `setStatus`, never a raw field write.**
   `updateApplication` patches fields directly and does *not* append to
   `stageHistory`. Every metric — funnel, response rate, time-in-stage —
   reads `stageHistory`, not the current status. `toApplicationPatch` in
   `src/lib/applicationForm.ts` deliberately omits `status`, and
   `applicationForm.test.ts` asserts that omission. This was a real bug: the
   edit dialog used to pass the whole form through, so editing an
   application's status silently lost the transition.
2. **Importers never auto-save.** Resume and LinkedIn imports both produce a
   *draft* that routes through `ProfileReviewForm` before anything is
   written. Nothing extracted is ever committed without a human seeing it.
3. **Document analysis is scoped to submitted applications.** A draft
   legitimately has no CV yet, so counting drafts as "missing documents"
   would invent a to-do list. See `submittedApplications` in
   `src/lib/documents.ts`.
4. **jobtrack stores filenames, never document bytes.** `FileRef` is
   metadata only. This bounds what the CV tab can honestly claim: coverage
   and reuse are computable; "is this CV tailored to the posting" is not,
   and is not claimed.
5. **Personal data must never be committed.** `tools/guard-repo.mjs` fails
   CI if a personal-data filename pattern is tracked or if `.gitignore`'s
   protections are weakened. Genuine synthetic fixtures need an explicit
   allowlist entry in the same commit.
6. **Develop from `~/dev/jobtrack`, not the Google-Drive-mounted tree.**
   `npm install` does not work reliably on the Drive mount.

## Verifying a change

```bash
npm run typecheck && npm test && npm run guard && npm run build
```

Browser-observable changes should also be checked against a running
`npm run dev` — several defects found so far (a duplicated resume
description, the status/stageHistory desync) were invisible to the unit
suite and only showed up live.
