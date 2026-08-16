# jobtrack and job-agent

Two repos, two jobs, one deliberate seam. This explains what each does, how
they connect, and what is intentionally *not* connected.

- **jobtrack** — https://github.com/nilpost/jobtrack (public, MIT). This repo.
- **job-agent** — https://github.com/nilpost/job-agent (private).

## The split

| | job-agent | jobtrack |
| --- | --- | --- |
| Question it answers | "What should I apply to, and what do I send?" | "What happened to everything I sent?" |
| Runs as | Claude Code commands in a terminal | A web app in your browser |
| Does | Scrapes portals, ranks fit, generates tailored CVs and cover letters | Kanban board, funnel metrics, document coverage, JD keyword analysis |
| Holds | LaTeX sources, compiled PDFs, a profile YAML | Applications, stage history, a candidate profile |
| Audience | One person (Nil), private | Anyone, public and generic |

job-agent **acts**. jobtrack **observes**. Keeping them apart is why jobtrack
can be public and useful to a stranger while job-agent stays private and
specific.

## How they connect

One direction only, through files, on demand:

```
job-agent/job_search_tracker.csv     ─┐
job-agent/job_scraper/seen_jobs.json ─┴─→  jobtrack "Import from job-agent"
```

- **`job_search_tracker.csv`** (required) — job-agent's own 13-column tracker.
  Maps into jobtrack's `Application` model.
- **`seen_jobs.json`** (optional) — adds `rank_score`, `rank_verdict`, and
  `authorization_signal` to matched applications.

See [src/lib/importers/jobAgent.ts](../src/lib/importers/jobAgent.ts).

### Rules the seam obeys

1. **Nothing is written back.** job-agent's files are read-only from here.
2. **User-triggered, never automatic.** There is no watcher and no sync loop.
3. **Re-running is safe.** Applications upsert on case-insensitive
   company + role. Re-importing unchanged data is a no-op.
4. **job-agent wins on status only.** It is the system of record for what
   actually happened. Every *other* field is additive: a blank cell never
   erases something entered in jobtrack, and notes and files merge rather
   than replace.
5. **jobtrack never requires it.** job-agent is one import source among
   several (manual, CSV, resume PDF/DOCX, LinkedIn export). A stranger with
   no job-agent gets the full app.

### Why file-based and not an API

job-agent is a set of Claude Code command definitions, not a service. It has
no process to call. Files are its actual interface, and reading them on
demand means jobtrack takes no dependency on job-agent's runtime, schedule,
or availability.

## Deliberately not shared

**The status vocabulary is mapped, not assumed.** job-agent and jobtrack use
almost identical status enums, which is exactly what makes silent drift
dangerous. `STATUS_MAP` and `AUTH_SIGNAL_MAP` in `jobAgent.ts` translate
every value explicitly — nothing passes through unchanged even when it looks
identical. job-agent's `requires_sponsorship_stated` becomes jobtrack's
`requires_sponsorship`; an unrecognised value is reported rather than
silently accepted.

**CV generation and rewriting stay in job-agent.** It already does CV
tailoring, cover-letter generation, ATS checks via `pdftotext`, and `/rank`
scoring, all under Claude Code on the user's own machine. jobtrack's
analysis is deliberately the deterministic half only — keyword gaps, weak
bullets, parseability — because anything that rewrites text needs a language
model, and sending CV content off-device would break jobtrack's local-first
promise. Rebuilding job-agent's generation here would also mean two
divergent implementations of the same thing. See
[BACKLOG.md](BACKLOG.md) §3.2.

**`/html-report` is not replaced.** It remains job-agent's offline,
zero-dependency deep-review lane.

## job-agent is a manual fork

job-agent descends from
[MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search)
but is **not** a GitHub fork — `isFork: false`, no parent. It was cloned and
re-pushed to a private repo, with `upstream` wired as a plain git remote.

Consequences worth knowing:

- Upstream changes do not appear automatically. As of 2026-08-14 the fork was
  35 commits behind before being merged up to v1.5.0.
- `tools/upstream_triage.py` and `.github/workflows/upstream-watch.yml` (from
  upstream #305/#320) now run weekly and file a rolling issue listing what is
  worth porting. Report-only, by design: on a fork "applies cleanly" is not
  "correct".
- Because an `upstream` remote exists, `gh` in that repo resolves to
  *upstream's* repo unless pinned. Fixed there with
  `gh repo set-default nilpost/job-agent`, which is per-clone.

None of this affects jobtrack, which has no upstream and is not a fork.
