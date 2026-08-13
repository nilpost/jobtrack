import type { CandidateProfile } from "../profileTypes"

/**
 * Keyword gap analysis: what a job posting asks for, and whether the saved
 * profile says it.
 *
 * Runs entirely in the browser with no model and no network. That bounds
 * what it can honestly claim, and the bound is worth stating plainly: this
 * is LEXICAL, not semantic. It knows "Kubernetes" appears in both texts. It
 * does not know that "led a team of six" answers "leadership experience".
 * A small alias table below covers the most common equivalences; everything
 * else is a judgement call left to the reader.
 *
 * Deliberately produces NO overall score. A "72% match" reads as a
 * measurement when it would really be an artefact of how many boilerplate
 * words the posting happened to contain — see the note on absent-term
 * ranking. Counts and lists, not percentages.
 */

/** Words carrying no signal in either direction. Kept deliberately short:
 *  an aggressive list starts eating real requirements ("lead", "support",
 *  "design" are all stopwords in some lists and all real skills here). */
const STOPWORDS = new Set([
  "a", "about", "above", "across", "after", "all", "also", "an", "and", "any", "are", "as", "at",
  "be", "been", "being", "both", "but", "by", "can", "could", "do", "does", "doing", "each",
  "either", "else", "etc", "for", "from", "get", "had", "has", "have", "having", "he", "her",
  "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "just", "may",
  "me", "might", "more", "most", "must", "my", "no", "not", "of", "off", "on", "once", "only",
  "or", "other", "our", "ours", "out", "over", "own", "per", "same", "shall", "she", "should",
  "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "then", "there",
  "these", "they", "this", "those", "through", "to", "too", "under", "until", "up", "us", "very",
  "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why", "will",
  "with", "would", "you", "your", "yours",
  // Job-posting boilerplate. These appear in almost every posting and match
  // almost every CV, so counting them would inflate any measure of overlap.
  "ability", "applicant", "apply", "candidate", "company", "employer", "experience", "job",
  "looking", "opportunity", "position", "role", "team", "work", "working", "years",
])

/**
 * Equivalences worth knowing about. Not exhaustive and not meant to be —
 * it covers the cases where a purely lexical comparison would report a gap
 * that plainly is not one, which is the failure mode that makes this kind
 * of tool untrustworthy.
 *
 * Each entry maps a term to its canonical form; both sides are normalised
 * through this table before comparison.
 */
const ALIASES = new Map<string, string>([
  ["ml", "machine learning"],
  ["machine-learning", "machine learning"],
  ["ai", "artificial intelligence"],
  ["k8s", "kubernetes"],
  ["js", "javascript"],
  ["ts", "typescript"],
  ["postgres", "postgresql"],
  ["pm", "product management"],
  ["product manager", "product management"],
  ["ci/cd", "cicd"],
  ["ci", "cicd"],
  ["cd", "cicd"],
  ["saas", "software as a service"],
  ["b2b", "business to business"],
  ["ux", "user experience"],
  ["ui", "user interface"],
  ["qa", "quality assurance"],
  ["r&d", "research and development"],
  ["kpi", "kpis"],
  ["oem", "original equipment manufacturer"],
])

function canonical(term: string): string {
  return ALIASES.get(term) ?? term
}

/** Lower-cases, strips punctuation that is never part of a term, and keeps
 *  the characters that genuinely are (+ in "C++", # in "C#", . in
 *  "Node.js", / in "CI/CD"). */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\w\s+#./&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenise(text: string): string[] {
  return normalise(text)
    .split(" ")
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
}

interface Term {
  term: string
  /** True only when this term exists because two tokens happened to sit next
   *  to each other. An alias expansion ("ml" -> "machine learning") is also
   *  multi-word but is a single deliberate term, and must not be filtered by
   *  the adjacency de-noising rule in analyseKeywords. */
  fromAdjacency: boolean
}

/**
 * Boundaries a two-word phrase cannot span: line ends, list items, and
 * sentence punctuation.
 *
 * Without this, a bulleted requirements list produces a bigram from the last
 * word of one bullet and the first of the next — "analysis rust", "design
 * sql", "environments deep". Every one of those is absent from any profile,
 * so they flood the gap list with phrases the posting never actually used.
 * Found by running a real posting through the UI; the unit tests used
 * single-sentence inputs too small to show it.
 */
function segments(text: string): string[] {
  // Split the RAW text: normalise() collapses every run of whitespace to a
  // single space, so splitting after it would find no line breaks left to
  // split on — the bug this function exists to fix would survive intact.
  return text
    .split(/[.;:!?]|\r?\n/)
    .map((s) => normalise(s))
    .filter(Boolean)
}

/** Unigrams plus adjacent bigrams. Bigrams matter because the meaningful
 *  requirements in a posting are frequently two words ("machine learning",
 *  "stakeholder management") and scoring only unigrams splits them into
 *  halves that each match something irrelevant. */
function terms(text: string): Term[] {
  const out: Term[] = []
  const allUnigrams: string[] = []

  for (const segment of segments(text)) {
    const unigrams = tokenise(segment)
    allUnigrams.push(...unigrams)
    for (let i = 0; i < unigrams.length - 1; i++) {
      out.push({ term: canonical(`${unigrams[i]} ${unigrams[i + 1]}`), fromAdjacency: true })
    }
  }

  for (const u of allUnigrams) out.push({ term: canonical(u), fromAdjacency: false })
  return out
}

function termStrings(text: string): string[] {
  return terms(text).map((t) => t.term)
}

export type MatchKind = "matched" | "partial" | "absent"

export interface TermFinding {
  term: string
  /** How often the posting uses it. A requirement repeated three times is
   *  usually a real requirement; one mentioned once may be a nice-to-have. */
  occurrences: number
  kind: MatchKind
}

export interface KeywordAnalysis {
  matched: TermFinding[]
  partial: TermFinding[]
  absent: TermFinding[]
  /** Terms considered after stopword removal — context for the lists above,
   *  not a denominator for a score. */
  consideredTerms: number
}

/** Everything in the profile a posting could reasonably match against. The
 *  profile is used rather than the raw CV text because the user has already
 *  reviewed and corrected it — analysing the reviewed version means a bad
 *  extraction cannot masquerade as a missing skill. */
export function profileText(profile: CandidateProfile): string {
  return [
    profile.summary ?? "",
    ...profile.skills,
    ...profile.experience.flatMap((e) => [e.title, e.company, e.description]),
    ...profile.education.flatMap((e) => [e.qualification, e.institution]),
  ].join("\n")
}

/**
 * A term is:
 *  - matched  — present in the profile as its own token
 *  - partial  — appears only inside a longer token, or shares a stem
 *               (plural/verb ending). Reported separately because "manage"
 *               vs "management" is usually fine and "java" inside
 *               "javascript" is usually not; the reader decides.
 *  - absent   — not found at all
 */
function classify(term: string, haystack: Set<string>, haystackText: string): MatchKind {
  if (haystack.has(term)) return "matched"

  // Stem-ish: tolerate the endings that differ between a posting's noun and
  // a CV's verb without pulling in a stemming library for four cases.
  const stem = term.replace(/(ing|ed|es|s)$/, "")
  if (stem.length > 3) {
    for (const candidate of haystack) {
      if (candidate.replace(/(ing|ed|es|s)$/, "") === stem) return "partial"
    }
  }

  if (term.length > 3 && haystackText.includes(term)) return "partial"
  return "absent"
}

export function analyseKeywords(
  jobDescription: string,
  profile: CandidateProfile,
): KeywordAnalysis {
  const profileNormalised = normalise(profileText(profile))
  const haystack = new Set(termStrings(profileText(profile)))

  // Count occurrences before de-duplicating, so ranking can use frequency.
  // `adjacencyOnly` tracks whether every sighting of a term came from two
  // tokens sitting next to each other, which is what the de-noising rule
  // below is allowed to discard.
  const counts = new Map<string, { occurrences: number; adjacencyOnly: boolean }>()
  for (const { term, fromAdjacency } of terms(jobDescription)) {
    const entry = counts.get(term)
    if (entry) {
      entry.occurrences += 1
      entry.adjacencyOnly = entry.adjacencyOnly && fromAdjacency
    } else {
      counts.set(term, { occurrences: 1, adjacencyOnly: fromAdjacency })
    }
  }

  const kindOf = new Map<string, MatchKind>()
  for (const term of counts.keys()) {
    kindOf.set(term, classify(term, haystack, profileNormalised))
  }

  /**
   * Whether an adjacency bigram earns its own finding.
   *
   * Repeated phrases always do — a posting that says "distributed systems"
   * twice means it. A one-off does only when BOTH halves are themselves
   * missing, i.e. it is a genuinely new requirement rather than a restatement
   * of unigrams already listed. That is what separates "distributed systems"
   * (both halves absent, real gap) from "ml background" (ML already matched,
   * so the bigram adds nothing but noise).
   */
  function bigramEarnsItsPlace(term: string, occurrences: number, kind: MatchKind): boolean {
    if (occurrences >= 2) return true
    if (kind !== "absent") return false
    const [left, right] = term.split(" ")
    return kindOf.get(left) === "absent" && kindOf.get(right) === "absent"
  }

  const findings: TermFinding[] = []
  for (const [term, { occurrences, adjacencyOnly }] of counts) {
    const kind = kindOf.get(term)!
    // Anything reached via an alias rather than adjacency is a single
    // deliberate term and is never filtered here.
    if (adjacencyOnly && !bigramEarnsItsPlace(term, occurrences, kind)) continue
    findings.push({ term, occurrences, kind })
  }

  const byWeight = (a: TermFinding, b: TermFinding) =>
    b.occurrences - a.occurrences || a.term.localeCompare(b.term)

  return {
    matched: findings.filter((f) => f.kind === "matched").sort(byWeight),
    partial: findings.filter((f) => f.kind === "partial").sort(byWeight),
    // Absent terms are ranked by how often the posting repeats them: the
    // gap worth acting on is the one the employer kept saying.
    absent: findings.filter((f) => f.kind === "absent").sort(byWeight),
    consideredTerms: counts.size,
  }
}
