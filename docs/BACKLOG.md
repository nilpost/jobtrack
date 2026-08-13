# Backlog

What's next, why, and what it costs. Ordered by value per unit of work
within each section, not by wishfulness.

Companion to [STATUS.md](STATUS.md) (what exists today) and
[self-hosting.md](self-hosting.md) (how to run the sync server).

---

## 0. Will not build — and why

Recording these so they stop being re-proposed. Each was investigated, not
assumed.

### Importing LinkedIn work history via "Sign in with LinkedIn"

**Not possible.** Not "hard", not "needs the right scopes" — not available.

LinkedIn's self-serve OAuth product (OpenID Connect) returns exactly three
things: name, profile picture, email. Positions, education, and skills were
removed from self-serve API access in 2023 and now sit behind a
partner-only programme that an open-source project cannot join. Requesting
broader scopes fails at the consent screen; there is no scope string that
changes this. See the comment at the top of `server/src/linkedin.ts`, where
the same fact is recorded next to the code.

**What to do instead:** the LinkedIn data-export importer, already built and
working — Settings & Privacy → Data privacy → Get a copy of your data, then
upload the .zip. That file *does* contain the full history, because it is
the user's own data export rather than a third-party API call.

**Where this is already said:** the sync settings panel states it directly
under the sign-in button, and the LinkedIn import dialog states it too. Both
are accurate and prominent. The remaining gap is that neither is visible
until you open that dialog — see item 2.1.

---

## 1. Sync and identity

Today's model, stated plainly because the questions keep coming back:

| Thing | Where it lives | Notes |
| --- | --- | --- |
| Sync auth | A single shared bearer token | Sent as `Authorization: Bearer …`. Not a login. |
| Sync token storage | Browser **localStorage** | Per-device config, deliberately not IndexedDB — it must never travel in an export, a CSV, or the sync payload (invariant 9 in STATUS.md). |
| LinkedIn identity | Signed **HttpOnly cookie** on the sync server's own domain | Set by `/auth/linkedin/callback`. |
| Relationship between the two | **None** | LinkedIn sign-in is decorative today: it proves who you are and nothing else. `server/src/app.ts` says it "never touches sync data", and that is literally true. |

So: **you cannot currently log in with Google or LinkedIn to sync.** Sync is
gated by a shared secret you paste into the app once per device. That is a
deliberate single-user design, not an oversight — but it is also the reason
the items below exist.

### 1.1 — Google Sign-In as the sync credential *(recommended first)*

Replace the pasted bearer token with a real login.

Google OIDC is the right choice over LinkedIn here: the app registration is
self-serve and instant, the `sub` claim is a stable per-user identifier, and
it does not depend on a partner programme that can be withdrawn. The server
would verify the Google ID token, map `sub` → account, and issue its own
session cookie — the same cookie machinery `linkedin.ts` already uses, so
much of this is refactoring rather than new code.

- **Blocked on:** a Google Cloud OAuth client (client id + secret + redirect
  URI). Self-serve, minutes.
- **Also requires:** deciding whether the server stays single-tenant. Right
  now one deployment holds one person's data. Real login implies either
  "one deployment per person, login just replaces the token" (small) or
  "multi-tenant, rows keyed by account" (a schema migration and a careful
  look at every sync query). Recommend the first — it keeps the
  self-hosting story honest and is a fraction of the work.
- **Watch out:** the deletion-tombstone logic and the "empty payload must
  never wipe the server" guard (invariants 7 and 8) are both account-scoped
  assumptions today. Multi-tenant would need both re-verified.

### 1.2 — LinkedIn sign-in as a sync credential

Same shape as 1.1, and possible, but strictly worse: it needs an approved
LinkedIn developer app, and it conflates "prove identity" with "unlock
sync". Only worth doing if LinkedIn login is wanted for its own sake.

### 1.3 — Explain sync in the app, not just the docs

The Settings → Sync panel assumes you already know what sync is for. It
should say, in the UI: data is local-first and stays in this browser by
default; sync is optional; it needs a server you run yourself; here is what
gets sent. One short paragraph and a link to `self-hosting.md`.

---

## 2. Honesty and orientation in the UI

### 2.1 — Surface the LinkedIn limitation before a dialog is opened

The copy already exists and is good (sync settings panel, and the LinkedIn
import dialog). The problem is purely placement: both live behind a click,
so someone forms the expectation "I'll log in and it will pull my profile"
before ever seeing the correction. A line on the Career Showcase empty state
— where the two import buttons already sit — would catch it earlier. Small.

### 2.2 — First-run orientation

A stranger opening the app sees an empty board and four import buttons with
no indication of which to use. A short empty state that names the paths
(manual · CSV · job-agent · resume · LinkedIn export) would carry most of
it.

---

## 3. CV and cover-letter analysis

The largest item, and the one most in need of honest scoping. The requested
capability list is roughly: ATS assessment, job-match/keyword-gap analysis,
resume rewriting, achievement-bullet strengthening, tailored cover letters,
LinkedIn profile copy, outreach and interview prep.

**Two hard constraints shape all of it:**

1. **jobtrack stores filenames, never document bytes** (invariant 4). The
   CV & Cover Letters tab is deliberately limited to coverage, gaps, and
   reuse for exactly this reason. Any real content analysis changes that
   posture and must be a conscious decision, not a side effect.
2. **`job-agent` already does much of this** — CV tailoring, cover-letter
   generation, ATS-parseability checking via `pdftotext`, and `/rank`
   scoring against a posting. Rebuilding it here would be duplicated,
   divergent logic. Decide *per capability* whether jobtrack owns it,
   job-agent owns it, or jobtrack visualises what job-agent produced.

### 3.1 — Deterministic, local, no API key *(do this first)*

Everything here runs in the browser with no model and no data leaving the
machine. `lib/importers/resume.ts` already extracts full CV text via pdf.js
and mammoth, so the input exists.

- **Keyword gap analysis.** Paste a job description; tokenise both sides;
  report matched / partially matched / absent terms with counts. Deliberately
  *not* a score — a percentage here is false precision.
- **ATS-parseability check.** Port the checks job-agent already makes: does
  the text layer extract cleanly, are email and phone present as literal
  text rather than only inside an icon glyph or hyperlink, does reading
  order match visual order.
- **Weak-bullet detection.** Flag duty phrasing ("responsible for",
  "managed") and bullets with no number in them. Detection only — the
  rewrite is 3.2.

Honest limit: none of this judges whether writing is *good*. It finds
mechanical problems, which is genuinely most of what ATS rejection is.

### 3.2 — LLM-assisted rewriting *(needs a decision first)*

Achievement rewriting, tailored CV generation, cover letters, LinkedIn
About/headline copy, outreach and interview prep. All need a language
model.

**This is a product decision, not a task.** It requires an API key and it
sends CV content off-device, which contradicts the local-first promise the
README makes. Options, in order of preference:

1. **Leave it to job-agent.** It already has this, running under Claude
   Code on the user's own machine. jobtrack imports the result. Costs
   nothing, breaks no promise.
2. **Bring-your-own-key**, off by default, with an explicit consent step
   naming what gets sent. Preserves the promise for everyone who does not
   opt in.
3. Server-side key. Rejected — makes the hosted instance a data processor.

Recommend 1, then 2 if there is real demand.

### 3.3 — Keep the analysis current

"Analysis should be updated following the latest CV" — this needs a
concrete trigger. Suggested: store a hash of the extracted CV text with each
analysis, and mark results stale in the UI when the current CV no longer
matches. Cheap, and it prevents acting on a stale report.

---

## 4. Operational

### 4.1 — Gate jobs.postiusgroup.com

Blocked on the Cloudflare token gaining `Access: Apps (Read + Edit)`.
`postius-hub/scripts/setup-access.mjs` already handles both creating and
updating policies and refuses to run while the token is blind. Once scoped:
dry run, then `--apply`.

### 4.2 — Update the four existing Access policies

`app`, `reports`, `finpal`, `codeweave` still allow the deprecated
`nil@amsform.com`. Same blocker as 4.1. If those policies are *reusable*
(the Zero Trust dashboard's default), they must be edited in the dashboard —
the script detects this and says so rather than failing obscurely.

### 4.3 — Not jobtrack, but noted

`companion.postiusgroup.com` returns 404 and is the one failing entry in
`verify-subdomains`. It is the Railway-hosted E-Companion, which
`postius-hub/projects.json` explicitly says not to port or re-subdomain.
Needs a look wherever it actually runs.
