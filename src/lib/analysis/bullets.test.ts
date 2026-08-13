import { describe, expect, test } from "vitest"

import { analyseBullet, analyseProfileBullets, splitBullets, summariseBullets } from "./bullets"
import type { CandidateProfile } from "../profileTypes"

function profileWith(description: string): CandidateProfile {
  return {
    skills: [],
    education: [],
    experience: [
      { id: "e1", title: "PM", company: "Acme", dates: "2020 – 2024", description },
    ],
    updatedAt: "2026-08-13T00:00:00.000Z",
  }
}

describe("splitBullets", () => {
  test("splits on newlines — what both importers actually produce", () => {
    expect(splitBullets("Did a thing\nDid another thing")).toEqual([
      "Did a thing",
      "Did another thing",
    ])
  })

  test("strips real bullet characters", () => {
    expect(splitBullets("• Shipped the platform\n• Grew revenue 3x")).toEqual([
      "Shipped the platform",
      "Grew revenue 3x",
    ])
  })

  test("drops blank lines rather than yielding empty bullets", () => {
    expect(splitBullets("One thing\n\n\nAnother thing")).toHaveLength(2)
  })
})

describe("analyseBullet", () => {
  test("flags duty phrasing", () => {
    expect(analyseBullet("Responsible for the roadmap across 3 teams")).toContain("duty_phrasing")
  })

  test("flags a bullet with no number", () => {
    expect(analyseBullet("Shipped the fleet management platform")).toContain("no_quantification")
  })

  test("does not flag quantification when a number is present in any form", () => {
    expect(analyseBullet("Grew pipeline 3x in two years")).not.toContain("no_quantification")
    expect(analyseBullet("Cut costs by $1.2M annually")).not.toContain("no_quantification")
    expect(analyseBullet("Improved conversion by 40%")).not.toContain("no_quantification")
  })

  test("flags a weak opening verb", () => {
    expect(analyseBullet("Managed the vendor relationship for 4 suppliers")).toContain("weak_verb")
  })

  // Two names for one problem is noise, and noise is how a check like this
  // stops being read.
  test("reports duty phrasing OR weak verb, never both for the same opening", () => {
    const issues = analyseBullet("Responsible for managing 5 vendors")
    expect(issues).toContain("duty_phrasing")
    expect(issues).not.toContain("weak_verb")
  })

  test("a strong quantified bullet has no issues at all", () => {
    expect(analyseBullet("Led the platform from MVP to $4M ARR in 18 months")).toEqual([])
  })

  test("'responsible' mid-sentence is not duty phrasing", () => {
    const issues = analyseBullet("Owned the 12-person team responsible for delivery")
    expect(issues).not.toContain("duty_phrasing")
  })
})

describe("analyseProfileBullets", () => {
  test("attributes each finding to its experience entry", () => {
    const findings = analyseProfileBullets(profileWith("Responsible for the product roadmap"))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ entryId: "e1", company: "Acme", title: "PM" })
  })

  test("skips fragments too short to judge", () => {
    // A three-word line is usually a heading or an extraction artefact.
    expect(analyseProfileBullets(profileWith("Product Strategy"))).toEqual([])
  })

  test("returns nothing for a profile with no experience", () => {
    const empty: CandidateProfile = {
      skills: [],
      education: [],
      experience: [],
      updatedAt: "2026-08-13T00:00:00.000Z",
    }
    expect(analyseProfileBullets(empty)).toEqual([])
  })
})

describe("summariseBullets", () => {
  test("counts rather than scores", () => {
    const summary = summariseBullets(
      profileWith("Grew revenue 3x in two years\nShipped the platform redesign"),
    )
    expect(summary).toEqual({ total: 2, quantified: 1, withIssues: 1 })
    expect(summary).not.toHaveProperty("score")
  })
})
