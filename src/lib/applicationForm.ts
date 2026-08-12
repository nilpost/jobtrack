import type { ApplicationFormValues } from "./schema"
import type { Application, FileRef } from "./types"

/**
 * Mapping between the edit form's flat shape and the stored Application.
 * Pure and component-free so the invariants below are unit-testable without
 * rendering anything — the status invariant in particular was a real bug
 * (see toApplicationPatch).
 */

export function toFormValues(app?: Application): ApplicationFormValues {
  return {
    company: app?.company ?? "",
    role: app?.role ?? "",
    roleType: app?.roleType ?? "",
    sector: app?.sector ?? "",
    channel: app?.channel ?? "",
    status: app?.status ?? "draft",
    fitScore: app?.fitScore,
    authorizationSignal: app?.authorizationSignal,
    contactPerson: app?.contactPerson ?? "",
    source: app?.source ?? "",
    cvFile: app?.files.find((f) => f.kind === "cv")?.filename ?? "",
    coverLetterFile: app?.files.find((f) => f.kind === "cover_letter")?.filename ?? "",
  }
}

/** The form offers one CV and one cover letter; Application.files stores
 *  them as a list. Blank inputs produce no entry at all rather than an entry
 *  with an empty filename. */
export function toFileRefs(values: ApplicationFormValues): FileRef[] {
  const files: FileRef[] = []
  const cv = values.cvFile?.trim()
  const coverLetter = values.coverLetterFile?.trim()
  if (cv) files.push({ kind: "cv", filename: cv })
  if (coverLetter) files.push({ kind: "cover_letter", filename: coverLetter })
  return files
}

/**
 * Everything the edit form can patch directly — deliberately EXCLUDING
 * `status`.
 *
 * updateApplication writes raw fields, so including status here would move
 * the application without appending to stageHistory, and the funnel,
 * response rate, and time-in-stage all read stageHistory rather than the
 * current status. Status changes must go through setStatus, which is the
 * only writer that keeps the two in sync. This was a real defect, so the
 * omission is asserted in applicationForm.test.ts rather than left to
 * convention.
 *
 * Built field-by-field rather than by spreading the form values so a future
 * form-only field (like cvFile) can't leak onto the stored row either.
 */
export function toApplicationPatch(values: ApplicationFormValues) {
  return {
    company: values.company,
    role: values.role,
    roleType: values.roleType,
    sector: values.sector,
    channel: values.channel,
    fitScore: values.fitScore,
    authorizationSignal: values.authorizationSignal,
    contactPerson: values.contactPerson,
    source: values.source,
    files: toFileRefs(values),
  }
}
