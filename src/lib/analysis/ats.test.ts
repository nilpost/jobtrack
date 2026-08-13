import { describe, expect, test } from "vitest"

import { analyseAts } from "./ats"

/** Deliberately the length a real one-page CV extracts to (~1.5k chars). An
 *  abbreviated fixture would sit under the sparse-text threshold and make
 *  the "clean" case untestable. */
const CLEAN = `Jane Doe
jane.doe@example.com | +1 415 555 0182
linkedin.com/in/janedoe | San Francisco, California

SUMMARY
Product leader with eight years building industrial AI platforms for
manufacturing and energy customers across Europe and Asia. Comfortable
operating between deep technical teams and commercial stakeholders, and
experienced taking a product from first prototype through to a supported
commercial offering with real revenue attached to it.

EXPERIENCE
Senior Product Manager, Acme Robotics
Jan 2020 - Present
Led the fleet management platform from MVP to commercialization, growing
the pipeline three times over two years and expanding into four markets.
Built and ran the discovery process with eleven pilot customers, which
reshaped the roadmap away from autonomy toward fleet observability.
Hired and mentored three product managers across two locations.

Product Manager, Beta Industrial
2017 - 2019
Owned the sensor integration roadmap across a dozen OEM partners, and
negotiated the data-sharing terms that made the analytics tier possible.
Cut integration lead time from six weeks to nine days.

EDUCATION
MBA, Stanford Graduate School of Business, 2015 - 2017
BSc Mechanical Engineering, MIT, 2009 - 2013

SKILLS
Product strategy, roadmapping, SQL, Python, stakeholder management,
technical discovery, pricing, go-to-market planning
`

const has = (findings: { id: string }[], id: string) => findings.some((f) => f.id === id)

describe("analyseAts", () => {
  test("a clean extraction reports ok and nothing else", () => {
    const findings = analyseAts(CLEAN)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ id: "clean", severity: "ok" })
  })

  // The check's whole reason to exist: this is the case that looks perfect
  // on screen and arrives as gibberish.
  test("flags unmapped glyph markers as a problem", () => {
    const findings = analyseAts(CLEAN.replace("Product leader", "(cid:12)(cid:45) leader"))
    expect(has(findings, "cid_markers")).toBe(true)
    expect(findings.find((f) => f.id === "cid_markers")?.severity).toBe("problem")
  })

  test("flags replacement characters", () => {
    expect(has(analyseAts(CLEAN.replace("Jane", "J�ne")), "replacement_chars")).toBe(true)
  })

  test("flags a missing email as a problem, not a warning", () => {
    const findings = analyseAts(CLEAN.replace("jane.doe@example.com | ", ""))
    expect(findings.find((f) => f.id === "no_email")?.severity).toBe("problem")
  })

  test("flags a missing phone as a warning — some people omit it deliberately", () => {
    const findings = analyseAts(CLEAN.replace("| +1 415 555 0182", ""))
    expect(findings.find((f) => f.id === "no_phone")?.severity).toBe("warning")
  })

  // A year range is a digit run and would otherwise be read as a phone.
  test("does not accept a date range as a phone number", () => {
    const noPhone = CLEAN.replace("| +1 415 555 0182", "")
    expect(has(analyseAts(noPhone), "no_phone")).toBe(true)
  })

  test("an empty extraction is a single, specific problem", () => {
    const findings = analyseAts("   \n  ")
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ id: "empty", severity: "problem" })
    expect(findings[0].detail).toMatch(/scanned image|photo/i)
  })

  test("warns when barely any text came through", () => {
    expect(has(analyseAts("Jane Doe\njane@example.com\n+1 415 555 0182"), "sparse_text")).toBe(true)
  })

  test("never reports ok alongside a problem", () => {
    const findings = analyseAts(CLEAN.replace("jane.doe@example.com | ", ""))
    expect(has(findings, "clean")).toBe(false)
  })
})
