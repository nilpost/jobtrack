# Starting a fresh session

Read this first if you have no prior context on this repo. It is written for
a new Claude session or a new contributor starting cold.

## Read in this order

1. **This file** — orientation and the traps.
2. **[STATUS.md](STATUS.md)** — what exists, what is blocked, and the nine
   invariants that fail *quietly* when broken. The invariants matter more
   than they look.
3. **[BACKLOG.md](BACKLOG.md)** — what to work on next and what has been
   ruled out (with reasons, so it is not re-litigated).
4. **[self-hosting.md](self-hosting.md)** — only if touching sync.

## Orientation in one paragraph

jobtrack is a local-first job-application tracker: a Kanban board with
funnel metrics, a CV/cover-letter coverage view, and a career profile built
from an imported resume or LinkedIn data export. It runs entirely in the
browser against IndexedDB with zero setup. A sync server exists in
`server/` but is strictly optional and off by default. The frontend is
deployed at https://jobs.postiusgroup.com.

## Where things are

| Path | What |
| --- | --- |
| `src/lib/` | All logic worth testing — importers, metrics, documents, db. Pure where possible. |
| `src/lib/importers/` | job-agent CSV, resume PDF/DOCX, LinkedIn .zip. Each produces a *draft* for human review. |
| `src/pages/` | One file per tab: Pipeline, CvPrep, CareerShowcase. |
| `server/` | Optional sync server. **Separate package**, separate lockfile, separate tsconfig. |
| `tools/guard-repo.mjs` | Personal-data guard. Runs in CI. |
| `wrangler.toml`, `.github/workflows/deploy-cloudflare.yml` | **Generated.** Do not edit — see below. |

## Working rules

**Develop from `~/dev/jobtrack`.** Not from the Google-Drive-mounted
Claude-Sync tree — `npm install` does not work reliably on that mount, and
git objects there fail to materialise. This clone deliberately lives outside
it.

**Verify with all four gates:**

```bash
npm run typecheck && npm test && npm run guard && npm run build
```

`npm run test:all` additionally runs the server suite. The server has its
own suite because it is a separate package.

**Verify browser-observable changes in a browser.** Several real defects
here were invisible to the unit suite and only appeared live: a duplicated
resume description, and a status change that silently failed to record
itself in `stageHistory`. Tests passing is not the same as it working.

## Traps that have already cost time

Each of these was hit for real. They share a shape: they fail somewhere
other than where the cause is.

1. **`wrangler.toml` and the deploy workflow are generated** by
   `postius-hub/scripts/gen-repo-config.mjs`. Edit the generator. Editing
   the files works until the next regeneration silently overwrites them.

2. **`server/` and the root are separate dependency trees.** Both need their
   own vitest config, and the server's must also supply an inline PostCSS
   config — otherwise vite and vitest each walk *upward* out of `server/`,
   find the root's configs, and require root-only packages. This passes
   locally (where the root install satisfies them) and fails only in CI.
   Two separate upward walks; both are now stopped in
   `server/vitest.config.ts`.

3. **Status must change via `setStatus`, never a field write.** See
   invariant 1 in STATUS.md. `toApplicationPatch` omits `status` on purpose
   and a test asserts the omission.

4. **Importers never auto-save.** Every extraction routes through
   `ProfileReviewForm` first. Preserve that.

5. **Synthetic fixtures need an allowlist entry** in `tools/guard-repo.mjs`
   *in the same commit*, or the guard fails CI.

6. **Escape backticks in commit messages** — or write the message to a file
   and use `git commit -F`. Unescaped backticks in a `-m "…"` string get
   interpreted as shell command substitution and silently delete text from
   the commit message. This has happened.

## The honest limits

Know these before promising anything:

- **jobtrack stores filenames, never document bytes.** The CV tab reports
  coverage, gaps, and reuse; it cannot judge a document's contents.
- **LinkedIn sign-in cannot import work history.** Ever. See section 0 of
  BACKLOG.md — it is a platform limitation, not a missing feature.
- **Metrics are personal-scale.** Every rate is shown with its raw count
  (`3/4`, not `75%`) on purpose. Do not add derived scores that imply more
  precision than a few dozen applications can support.
