import { z } from "zod"

/**
 * The server's own validation schemas.
 *
 * These deliberately duplicate the client's types in src/lib/types.ts rather
 * than importing them. This is a trust boundary: everything arriving here is
 * untrusted input from a browser, and the server must validate its actual
 * shape rather than assume the client's TypeScript types held. Sharing the
 * types would make "the client says it's an Application" and "it is actually
 * an Application" the same statement, which is exactly the assumption a
 * server must not make.
 *
 * Unknown fields are stripped by default (zod's non-passthrough behaviour),
 * so a newer client sending extra keys degrades safely instead of writing
 * arbitrary data into the database.
 */

const iso = z.string().datetime({ offset: true }).or(z.string().datetime())

export const statusSchema = z.enum([
  "draft",
  "applied",
  "interview",
  "offer",
  "hired",
  "rejected",
  "no_response",
  "offer_declined",
  "withdrawn",
])

export const applicationSchema = z.object({
  id: z.string().min(1).max(128),
  company: z.string().max(500),
  role: z.string().max(500),
  roleType: z.string().max(200).optional(),
  sector: z.string().max(200).optional(),
  channel: z.string().max(200).optional(),
  status: statusSchema,
  stageHistory: z
    .array(
      z.object({
        status: statusSchema,
        at: iso,
        note: z.string().max(5000).optional(),
      }),
    )
    .max(200),
  fitScore: z.number().min(0).max(100).optional(),
  fitVerdict: z.string().max(500).optional(),
  authorizationSignal: z
    .enum(["requires_sponsorship", "pr_or_citizen_required", "domestic_only_implied", "silent"])
    .optional(),
  contactPerson: z.string().max(300).optional(),
  source: z.string().max(2000).optional(),
  notes: z.array(z.object({ at: iso, text: z.string().max(20000) })).max(500),
  // Filenames only. The server has no upload endpoint and no blob storage by
  // design — jobtrack never transmits document bytes, so a client that tried
  // to send them would have nowhere to put them.
  files: z
    .array(z.object({ kind: z.enum(["cv", "cover_letter"]), filename: z.string().max(500) }))
    .max(50),
  createdAt: iso,
  updatedAt: iso,
})

export const profileSchema = z.object({
  name: z.string().max(300).optional(),
  email: z.string().max(300).optional(),
  phone: z.string().max(100).optional(),
  location: z.string().max(300).optional(),
  linkedin: z.string().max(500).optional(),
  github: z.string().max(500).optional(),
  portfolio: z.string().max(500).optional(),
  summary: z.string().max(20000).optional(),
  experience: z
    .array(
      z.object({
        id: z.string().max(128),
        company: z.string().max(500),
        title: z.string().max(500),
        dates: z.string().max(200),
        description: z.string().max(20000),
      }),
    )
    .max(100),
  education: z
    .array(
      z.object({
        id: z.string().max(128),
        institution: z.string().max(500),
        qualification: z.string().max(500),
        dates: z.string().max(200),
      }),
    )
    .max(100),
  skills: z.array(z.string().max(200)).max(500),
  updatedAt: iso,
})

export const deletionSchema = z.object({
  id: z.string().min(1).max(128),
  deletedAt: iso,
})

/** What a client pushes, and what the server returns — the same shape, so
 *  the client can replace its local state with the response wholesale. */
export const syncStateSchema = z.object({
  applications: z.array(applicationSchema).max(10000),
  profile: profileSchema.nullable(),
  deletions: z.array(deletionSchema).max(10000),
})

export type Status = z.infer<typeof statusSchema>
export type Application = z.infer<typeof applicationSchema>
export type CandidateProfile = z.infer<typeof profileSchema>
export type Deletion = z.infer<typeof deletionSchema>
export type SyncState = z.infer<typeof syncStateSchema>
