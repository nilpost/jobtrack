import { describe, expect, test } from "vitest"
import {
  extractContactInfo,
  parseEducationEntries,
  parseExperienceEntries,
  parseResumeText,
  parseSkills,
  splitIntoSections,
} from "./resume"

const SAMPLE_RESUME = `Jane Doe
jane.doe@example.com | +1 415 555 0182
linkedin.com/in/janedoe | github.com/janedoe

SUMMARY
Product leader with 8 years building industrial AI platforms.

EXPERIENCE
Senior Product Manager, Acme Robotics
Jan 2020 - Present
Led the fleet management platform from MVP to commercialization.
Grew the pipeline 3x in two years.

Product Manager, Beta Industrial
2017 - 2019
Owned the sensor integration roadmap.

EDUCATION
MBA, Stanford Graduate School of Business
2015 - 2017

BSc Mechanical Engineering, MIT
2009 - 2013

SKILLS
Product strategy, Roadmapping, SQL, Python, Stakeholder management
`

describe("extractContactInfo", () => {
  test("extracts email, phone, linkedin, github, and a guessed name", () => {
    const info = extractContactInfo(SAMPLE_RESUME)
    expect(info.email).toBe("jane.doe@example.com")
    expect(info.phone).toBe("+1 415 555 0182")
    expect(info.linkedin).toBe("https://linkedin.com/in/janedoe")
    expect(info.github).toBe("https://github.com/janedoe")
    expect(info.name).toBe("Jane Doe")
  })

  test("a short digit-free line that IS a section header is never guessed as a name", () => {
    const info = extractContactInfo("SUMMARY\nSome text\njane@example.com")
    expect(info.name).toBeUndefined()
  })

  test("a date range is never mistaken for a phone number", () => {
    const info = extractContactInfo("Experience\n2015 - 2020\nSome role")
    expect(info.phone).toBeUndefined()
  })

  test("missing contact fields stay undefined, never fabricated", () => {
    const info = extractContactInfo("Random text with no structure at all")
    expect(info.email).toBeUndefined()
    expect(info.phone).toBeUndefined()
    expect(info.linkedin).toBeUndefined()
    expect(info.github).toBeUndefined()
  })

  test("a first line over 60 characters is not guessed as a name", () => {
    const info = extractContactInfo(
      "This is a very long first line that goes on and on and is definitely not a persons name at all\nmore text",
    )
    expect(info.name).toBeUndefined()
  })
})

describe("splitIntoSections", () => {
  test("splits on known headers and assigns content to the right section", () => {
    const sections = splitIntoSections(SAMPLE_RESUME)
    expect(sections.summary).toContain("Product leader with 8 years")
    expect(sections.experience).toContain("Senior Product Manager, Acme Robotics")
    expect(sections.education).toContain("MBA, Stanford")
    expect(sections.skills).toContain("Product strategy")
  })

  test("recognizes common header synonyms case-insensitively", () => {
    const text = "work experience\nDid stuff\n\nTechnical Skills\nPython"
    const sections = splitIntoSections(text)
    expect(sections.experience).toBe("Did stuff")
    expect(sections.skills).toBe("Python")
  })

  test("text before the first recognized header belongs to no section", () => {
    const sections = splitIntoSections("Jane Doe\njane@example.com\n\nEDUCATION\nMIT")
    expect(sections.education).toBe("MIT")
    expect(Object.keys(sections)).toEqual(["education"])
  })

  test("a resume with no recognizable headers produces an empty section map, not a crash", () => {
    expect(() => splitIntoSections("just some free text\nwith no structure")).not.toThrow()
    expect(splitIntoSections("just some free text\nwith no structure")).toEqual({})
  })
})

describe("parseExperienceEntries", () => {
  test("splits blank-line-delimited blocks into entries with title/company/dates/description", () => {
    const entries = parseExperienceEntries(
      "Senior Product Manager, Acme Robotics\nJan 2020 - Present\nLed the platform.\n\nProduct Manager, Beta Industrial\n2017 - 2019\nOwned the roadmap.",
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].title).toBe("Senior Product Manager")
    expect(entries[0].company).toBe("Acme Robotics")
    expect(entries[0].dates).toBe("Jan 2020 - Present")
    expect(entries[0].description).toContain("Led the platform")
    expect(entries[1].company).toBe("Beta Industrial")
  })

  test("the dates line is consumed, not duplicated into the description", () => {
    // The regression this guards: extracting a date via regex without
    // excluding the line it came from left it duplicated verbatim as the
    // first line of the description — caught live in the browser, not by
    // the test above, because that test only checked toContain.
    const entries = parseExperienceEntries(
      "Senior Product Manager, Nimbus Robotics\nMar 2021 - Present\nLed fleet management platform.\nGrew pipeline 3x.",
    )
    expect(entries[0].dates).toBe("Mar 2021 - Present")
    expect(entries[0].description).toBe("Led fleet management platform.\nGrew pipeline 3x.")
    expect(entries[0].description).not.toContain("Mar 2021")
  })

  test("dates embedded in the header line itself are extracted without breaking the description", () => {
    const entries = parseExperienceEntries(
      "Senior Engineer, Acme (2019 - 2022)\nBuilt the core platform.",
    )
    expect(entries[0].dates).toBe("2019 - 2022")
    expect(entries[0].description).toBe("Built the core platform.")
  })

  test("a header line with no recognized separator keeps the whole line as title, company blank", () => {
    const entries = parseExperienceEntries("Just one unsplittable line\nsome description")
    expect(entries[0].title).toBe("Just one unsplittable line")
    expect(entries[0].company).toBe("")
  })

  test("undefined or empty section text produces no entries, not an error", () => {
    expect(parseExperienceEntries(undefined)).toEqual([])
    expect(parseExperienceEntries("")).toEqual([])
  })

  test("each entry gets a unique id", () => {
    const entries = parseExperienceEntries("Role A, Co A\n\nRole B, Co B")
    expect(entries[0].id).not.toBe(entries[1].id)
  })
})

describe("parseEducationEntries", () => {
  test("splits into qualification/institution/dates", () => {
    const entries = parseEducationEntries(
      "MBA, Stanford Graduate School of Business\n2015 - 2017\n\nBSc Mechanical Engineering, MIT\n2009 - 2013",
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].qualification).toBe("MBA")
    expect(entries[0].institution).toBe("Stanford Graduate School of Business")
    expect(entries[0].dates).toBe("2015 - 2017")
    expect(entries[1].qualification).toBe("BSc Mechanical Engineering")
  })
})

describe("parseSkills", () => {
  test("splits on commas, dedupes case-insensitively, keeps first-seen casing", () => {
    const skills = parseSkills("Python, SQL, python, Roadmapping")
    expect(skills).toEqual(["Python", "SQL", "Roadmapping"])
  })

  test("splits on newlines and bullet characters too", () => {
    const skills = parseSkills("• Python\n• SQL\n· Roadmapping")
    expect(skills).toEqual(["Python", "SQL", "Roadmapping"])
  })

  test("undefined section text produces an empty list", () => {
    expect(parseSkills(undefined)).toEqual([])
  })
})

describe("parseResumeText — full orchestration", () => {
  test("produces a complete draft from a well-formed resume", () => {
    const draft = parseResumeText(SAMPLE_RESUME)
    expect(draft.name).toBe("Jane Doe")
    expect(draft.email).toBe("jane.doe@example.com")
    expect(draft.experience).toHaveLength(2)
    expect(draft.education).toHaveLength(2)
    expect(draft.skills).toContain("SQL")
    expect(draft.summary).toContain("Product leader")
  })

  test("a resume with no recognizable structure still returns a valid, empty-ish draft", () => {
    const draft = parseResumeText("Some unstructured text with no headers at all, quite long really")
    expect(draft.experience).toEqual([])
    expect(draft.education).toEqual([])
    expect(draft.skills).toEqual([])
    // no throw, no fabricated fields
    expect(draft.email).toBeUndefined()
  })

  test("an empty string never throws", () => {
    expect(() => parseResumeText("")).not.toThrow()
  })
})
