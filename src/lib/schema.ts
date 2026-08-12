import { z } from "zod"
import { AUTHORIZATION_SIGNALS, STATUSES } from "./types"

/** Validates both the manual-entry form and CSV import rows — one schema,
 *  so the two paths can never silently accept different shapes of data. */
export const applicationFormSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  role: z.string().trim().min(1, "Role is required"),
  roleType: z.string().trim().optional(),
  sector: z.string().trim().optional(),
  channel: z.string().trim().optional(),
  status: z.enum(STATUSES),
  // An empty input must stay "not scored" (undefined), not become 0 — those
  // are different claims (0 says "evaluated, poor fit"; empty says "not
  // evaluated yet"). z.coerce.number() alone coerces "" to 0, so the empty
  // case is intercepted before coercion runs.
  fitScore: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : val),
    z.coerce.number().min(0).max(100).optional(),
  ),
  authorizationSignal: z.enum(AUTHORIZATION_SIGNALS).optional(),
  contactPerson: z.string().trim().optional(),
  // Filenames only — jobtrack never stores or syncs document bytes (see
  // FileRef). Flat fields here rather than a nested array because the form
  // offers exactly one of each; they map to/from Application.files on save.
  cvFile: z.string().trim().optional(),
  coverLetterFile: z.string().trim().optional(),
  source: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^https?:\/\//i.test(v), "Must be a URL starting with http(s)://"),
})

export type ApplicationFormValues = z.infer<typeof applicationFormSchema>
