/**
 * ATS-parseability checks over the text extracted from a resume file.
 *
 * An applicant tracking system reads the PDF's embedded text layer, not the
 * rendered page. A CV can look immaculate and still arrive as mojibake, or
 * with the phone number invisible because it lives inside an icon glyph.
 * These checks run on exactly what extraction produced (see
 * lib/importers/resume.ts) and so see what a parser would see.
 *
 * Ported from the equivalent checks job-agent makes with `pdftotext` during
 * /apply, so the two tools agree about what "ATS-parseable" means rather
 * than each having a private definition.
 *
 * What this cannot check: reading order in a multi-column layout. Extraction
 * here reconstructs lines from Y-coordinates, which flattens columns in a
 * way that makes column-order problems indistinguishable from normal text.
 * Saying so is better than implying a clean report means a clean CV.
 */

export type AtsSeverity = "problem" | "warning" | "ok"

export interface AtsFinding {
  id: string
  severity: AtsSeverity
  title: string
  detail: string
}

/** Replacement characters and PDF glyph-id markers — the two signatures of
 *  a text layer that did not survive extraction. `(cid:NN)` in particular
 *  means the font carried no usable character mapping, and an ATS will read
 *  literally that. */
const MOJIBAKE = /�/g
const CID_MARKER = /\(cid:\d+\)/g

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/

export function analyseAts(text: string): AtsFinding[] {
  const findings: AtsFinding[] = []
  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return [
      {
        id: "empty",
        severity: "problem",
        title: "No text could be extracted",
        detail:
          "The file has no readable text layer. This is usually a scanned image or a photo " +
          "saved as a PDF — an ATS will read nothing at all from it. Export a fresh PDF from " +
          "the original document rather than scanning a printout.",
      },
    ]
  }

  const cidCount = (trimmed.match(CID_MARKER) ?? []).length
  if (cidCount > 0) {
    findings.push({
      id: "cid_markers",
      severity: "problem",
      title: `${cidCount} unmapped glyph marker${cidCount === 1 ? "" : "s"} in the text layer`,
      detail:
        "Text appears as (cid:NN) rather than characters, meaning the embedded font has no " +
        "character mapping. It looks correct on screen and is unreadable to a parser. " +
        "Re-export the PDF with fonts embedded as standard, or change the template's font.",
    })
  }

  const mojibakeCount = (trimmed.match(MOJIBAKE) ?? []).length
  if (mojibakeCount > 0) {
    findings.push({
      id: "replacement_chars",
      severity: "problem",
      title: `${mojibakeCount} unreadable character${mojibakeCount === 1 ? "" : "s"}`,
      detail:
        "The extraction produced replacement characters, so some text did not survive encoding. " +
        "Accented names and non-Latin scripts are the usual casualties.",
    })
  }

  // Contact details are the single most consequential thing to get wrong:
  // a CV that parses perfectly and loses the email address still fails.
  if (!EMAIL_RE.test(trimmed)) {
    findings.push({
      id: "no_email",
      severity: "problem",
      title: "No email address in the extracted text",
      detail:
        "An address that only exists inside an icon, an image, or a hyperlink's display text is " +
        "invisible to a parser. Write it out as plain text.",
    })
  }

  const phone = PHONE_RE.exec(trimmed)
  const phoneDigits = phone ? (phone[0].match(/\d/g) ?? []).length : 0
  if (!phone || phoneDigits < 9) {
    findings.push({
      id: "no_phone",
      severity: "warning",
      title: "No phone number in the extracted text",
      detail:
        "Same failure as an email inside an icon. A warning rather than a problem, since some " +
        "people deliberately leave the number off.",
    })
  }

  // A real CV extracts to something on the order of a couple of thousand
  // characters. Far less means most of the document did not come through,
  // even though something did.
  if (trimmed.length < 600) {
    findings.push({
      id: "sparse_text",
      severity: "warning",
      title: "Very little text extracted",
      detail:
        `Only ${trimmed.length} characters came through, which is far less than a normal CV. ` +
        "Part of the document is likely an image, or in a text box the extractor cannot reach.",
    })
  }

  if (findings.length === 0) {
    findings.push({
      id: "clean",
      severity: "ok",
      title: "Text layer looks parseable",
      detail:
        "Text extracted cleanly and contact details are present as real text. Note this cannot " +
        "verify reading order in a multi-column layout — a single-column CV is the safe choice.",
    })
  }

  return findings
}
