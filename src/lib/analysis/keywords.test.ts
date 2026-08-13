import { describe, expect, test } from "vitest"

import { analyseKeywords, normalise, profileText } from "./keywords"
import type { CandidateProfile } from "../profileTypes"

function profile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    summary: "Product leader building industrial AI platforms.",
    skills: ["Kubernetes", "SQL", "Stakeholder management"],
    experience: [
      {
        id: "e1",
        title: "Senior Product Manager",
        company: "Nimbus Robotics",
        dates: "2021 – Present",
        description: "Led the fleet platform from MVP to commercialization.",
      },
    ],
    education: [
      { id: "d1", qualification: "MBA", institution: "Stanford", dates: "2015 – 2017" },
    ],
    updatedAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  }
}

const find = (list: { term: string }[], term: string) => list.find((f) => f.term === term)

describe("normalise", () => {
  test("keeps characters that are part of real technology names", () => {
    expect(normalise("C++, C#, Node.js and CI/CD")).toBe("c++ c# node.js and ci/cd")
  })

  test("strips punctuation that never is", () => {
    expect(normalise("Kubernetes! (required)")).toBe("kubernetes required")
  })
})

describe("analyseKeywords", () => {
  test("reports a requirement the profile states as matched", () => {
    const result = analyseKeywords("We need strong Kubernetes skills.", profile())
    expect(find(result.matched, "kubernetes")).toBeTruthy()
  })

  test("reports a requirement the profile never mentions as absent", () => {
    const result = analyseKeywords("Rust and Terraform are required.", profile())
    expect(find(result.absent, "rust")).toBeTruthy()
    expect(find(result.absent, "terraform")).toBeTruthy()
  })

  test("ranks absent terms by how often the posting repeats them", () => {
    const jd = "Terraform expertise. Terraform pipelines. Terraform modules. Also Rust."
    const result = analyseKeywords(jd, profile())
    expect(result.absent[0].term).toBe("terraform")
    expect(result.absent[0].occurrences).toBe(3)
  })

  // The failure mode that makes this kind of tool untrustworthy: reporting a
  // gap that plainly is not one.
  test("resolves an abbreviation to its expanded form rather than calling it a gap", () => {
    const withMl = profile({ skills: ["machine learning"] })
    const result = analyseKeywords("Deep ML experience required.", withMl)
    expect(find(result.absent, "machine learning")).toBeUndefined()
    expect(find(result.matched, "machine learning")).toBeTruthy()
  })

  test("treats a noun/verb ending difference as partial, not absent", () => {
    // Profile says "management"; posting says "manage".
    const result = analyseKeywords("You will manage stakeholders.", profile())
    expect(find(result.absent, "manage")).toBeUndefined()
    expect(find(result.partial, "manage")).toBeTruthy()
  })

  test("does not let boilerplate inflate the findings", () => {
    const jd = "We are looking for a candidate with the ability to work in a team."
    const result = analyseKeywords(jd, profile())
    const allTerms = [...result.matched, ...result.partial, ...result.absent].map((f) => f.term)
    for (const boilerplate of ["candidate", "ability", "team", "looking", "work"]) {
      expect(allTerms).not.toContain(boilerplate)
    }
  })

  test("surfaces a multi-word requirement as one finding, not two halves", () => {
    const result = analyseKeywords("Experience with distributed systems is essential.", profile())
    expect(find(result.absent, "distributed systems")).toBeTruthy()
  })

  // A bigram whose parts are both present would otherwise produce a third
  // finding restating what two matched terms already said.
  test("suppresses a redundant matched bigram mentioned only once", () => {
    const result = analyseKeywords("Strong stakeholder management needed.", profile())
    expect(find(result.matched, "stakeholder management")).toBeUndefined()
    expect(find(result.matched, "stakeholder")).toBeTruthy()
  })

  /**
   * Regression: a bulleted requirements list used to produce bigrams from
   * the last word of one bullet and the first of the next — "analysis rust",
   * "design sql" — which are absent from every profile and so flooded the
   * gap list with phrases the posting never used. Found by running a real
   * posting through the UI, not by the tests above, which were too small.
   */
  test("does not form phrases across line breaks or list items", () => {
    const jd = `Requirements:
- SQL and data analysis
- Rust or Go for tooling
- Terraform module design`
    const result = analyseKeywords(jd, profile())
    const allTerms = [...result.matched, ...result.partial, ...result.absent].map((f) => f.term)
    expect(allTerms).not.toContain("analysis rust")
    expect(allTerms).not.toContain("tooling terraform")
    // Phrases WITHIN one line still survive.
    expect(allTerms).toContain("module design")
  })

  test("does not form phrases across sentence boundaries", () => {
    const result = analyseKeywords("You will use Terraform. Rust is a plus.", profile())
    expect([...result.absent].map((f) => f.term)).not.toContain("terraform rust")
  })

  // "ml background" adds nothing once ML itself is reported as matched.
  test("drops a one-off phrase whose halves are already covered", () => {
    const withMl = profile({ skills: ["machine learning", "Kubernetes"] })
    const result = analyseKeywords("Kubernetes background required", withMl)
    expect(result.absent.map((f) => f.term)).not.toContain("kubernetes background")
  })

  test("keeps a one-off phrase when both halves are genuinely missing", () => {
    const result = analyseKeywords("Experience with distributed systems", profile())
    expect(result.absent.map((f) => f.term)).toContain("distributed systems")
  })

  test("keeps a repeated phrase even when its halves are covered", () => {
    const jd = "Stakeholder management is key. Stakeholder management drives this role."
    const result = analyseKeywords(jd, profile())
    const found = [...result.matched, ...result.partial].find(
      (f) => f.term === "stakeholder management",
    )
    expect(found?.occurrences).toBe(2)
  })

  test("an empty posting yields no findings rather than throwing", () => {
    const result = analyseKeywords("", profile())
    expect(result.matched).toEqual([])
    expect(result.absent).toEqual([])
    expect(result.consideredTerms).toBe(0)
  })

  test("reports no score — only counts and lists", () => {
    const result = analyseKeywords("Kubernetes and Rust.", profile())
    expect(result).not.toHaveProperty("score")
    expect(result).not.toHaveProperty("percentage")
  })
})

describe("profileText", () => {
  test("draws on every field a posting could reasonably match", () => {
    const text = profileText(profile())
    expect(text).toContain("Kubernetes")
    expect(text).toContain("Senior Product Manager")
    expect(text).toContain("fleet platform")
    expect(text).toContain("MBA")
  })
})
