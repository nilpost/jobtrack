import JSZip from "jszip"
import { describe, expect, test } from "vitest"

import { parseLinkedInZip } from "./linkedin"

const PROFILE_CSV =
  "First Name,Last Name,Headline,Summary,Geo Location,Websites\n" +
  'Jamie,Chen,Senior Backend Engineer,"Backend engineer, 6 years in distributed systems.","Tokyo, Japan",https://jamiechen.dev'

const EMAIL_CSV =
  "Email Address,Confirmed,Primary,Updated On\n" +
  "old@example.com,Yes,No,2019-01-01\n" +
  "jamie.chen@example.com,Yes,Yes,2024-01-01\n"

const POSITIONS_CSV =
  "Company Name,Title,Description,Location,Started On,Finished On\n" +
  '"Nimbus Robotics",Staff Engineer,"Led the platform migration.",Tokyo,Mar 2021,\n' +
  '"Kestrel Energy Systems",Backend Engineer,"Owned the billing service.",Osaka,Jun 2017,Feb 2021\n'

const EDUCATION_CSV =
  "School Name,Start Date,End Date,Degree Name,Field Of Study\n" +
  "University of Tokyo,2013,2017,BSc,Computer Science\n"

const SKILLS_CSV = "Name\nGo\nKubernetes\ngo\nPostgreSQL\n"

/** Builds a real zip (serialize then deserialize) so the test exercises the
 *  same bytes-in, bytes-out path a real LinkedIn export goes through — not
 *  just an in-memory JSZip object the code never actually produces this
 *  way. */
async function buildZip(files: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  const buffer = await zip.generateAsync({ type: "nodebuffer" })
  return JSZip.loadAsync(buffer)
}

describe("parseLinkedInZip", () => {
  test("maps a complete export into a resume draft", async () => {
    const zip = await buildZip({
      "Profile.csv": PROFILE_CSV,
      "Email Addresses.csv": EMAIL_CSV,
      "Positions.csv": POSITIONS_CSV,
      "Education.csv": EDUCATION_CSV,
      "Skills.csv": SKILLS_CSV,
    })

    const { draft, errors } = await parseLinkedInZip(zip)

    expect(errors).toEqual([])
    expect(draft.name).toBe("Jamie Chen")
    expect(draft.location).toBe("Tokyo, Japan")
    expect(draft.summary).toBe("Backend engineer, 6 years in distributed systems.")
    expect(draft.portfolio).toBe("https://jamiechen.dev")
    expect(draft.email).toBe("jamie.chen@example.com") // Primary=Yes row, not the first row

    expect(draft.experience).toHaveLength(2)
    expect(draft.experience[0]).toMatchObject({
      company: "Nimbus Robotics",
      title: "Staff Engineer",
      dates: "Mar 2021 – Present",
      description: "Led the platform migration.",
    })
    expect(draft.experience[1].dates).toBe("Jun 2017 – Feb 2021")

    expect(draft.education).toHaveLength(1)
    expect(draft.education[0]).toMatchObject({
      institution: "University of Tokyo",
      qualification: "BSc, Computer Science",
      dates: "2013 – 2017",
    })

    // "go" deduped against "Go" case-insensitively, first-seen casing kept.
    expect(draft.skills).toEqual(["Go", "Kubernetes", "PostgreSQL"])
  })

  test("finds files inside a nested export folder, matched case-insensitively", async () => {
    const zip = await buildZip({
      "LinkedInDataExport_08-12-2026/profile.CSV": PROFILE_CSV,
      "LinkedInDataExport_08-12-2026/positions.csv": POSITIONS_CSV,
    })

    const { draft, errors } = await parseLinkedInZip(zip)

    expect(draft.name).toBe("Jamie Chen")
    expect(draft.experience).toHaveLength(2)
    // Files this export tier doesn't include are reported, not fatal.
    expect(errors).toContain("Email Addresses.csv not found in export — email left blank")
    expect(errors).toContain("Education.csv not found in export — education left empty")
    expect(errors).toContain("Skills.csv not found in export — skills left empty")
  })

  test("a Basic-tier export missing every relevant file reports every gap and returns an empty draft, not a throw", async () => {
    const zip = await buildZip({ "Connections.csv": "First Name,Last Name\nA,B\n" })

    const { draft, errors } = await parseLinkedInZip(zip)

    expect(draft).toMatchObject({
      name: undefined,
      email: undefined,
      experience: [],
      education: [],
      skills: [],
    })
    expect(errors).toHaveLength(5)
  })

  test("a Positions row with no company or title is dropped rather than producing a blank entry", async () => {
    const zip = await buildZip({
      "Positions.csv": "Company Name,Title,Description,Location,Started On,Finished On\n,,,,,\n",
    })

    const { draft } = await parseLinkedInZip(zip)

    expect(draft.experience).toEqual([])
  })
})
