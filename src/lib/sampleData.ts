import { createApplication, clearAllApplications } from "./db"
import type { NewApplication, StageEvent, Status } from "./types"

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

/** Builds a plausible stageHistory ending at `finalStatus`, spread across
 *  the given day offsets (oldest first). */
function history(finalStatus: Status, offsets: number[]): StageEvent[] {
  const path: Status[] = ["draft", "applied", "interview", "offer", finalStatus]
  const relevant = path.slice(0, offsets.length)
  return relevant.map((status, i) => ({ status, at: daysAgo(offsets[i]) }))
}

const SAMPLE: (NewApplication & { stageHistory: StageEvent[] })[] = [
  {
    company: "Nimbus Robotics",
    role: "Senior Product Manager, Industrial AI",
    sector: "Robotics",
    channel: "LinkedIn",
    status: "interview",
    fitScore: 88,
    fitVerdict: "Strong Fit",
    authorizationSignal: "pr_or_citizen_required",
    contactPerson: "Aiko Tanaka",
    source: "https://example.com/jobs/nimbus-pm",
    stageHistory: history("interview", [21, 18, 9]),
    files: [
      { kind: "cv", filename: "cv_nimbus_product_manager.pdf" },
      { kind: "cover_letter", filename: "cover_nimbus_product_manager.pdf" },
    ],
  },
  {
    company: "Kestrel Energy Systems",
    role: "Program Manager, AI Transformation",
    sector: "Energy",
    channel: "Referral",
    status: "offer",
    fitScore: 92,
    fitVerdict: "Strong Fit",
    authorizationSignal: "pr_or_citizen_required",
    contactPerson: "Marcus Webb",
    source: "https://example.com/jobs/kestrel-program-mgr",
    stageHistory: history("offer", [40, 36, 24, 12]),
    files: [
      { kind: "cv", filename: "cv_kestrel_program_manager.pdf" },
      { kind: "cover_letter", filename: "cover_kestrel_program_manager.pdf" },
    ],
  },
  {
    company: "Torii Manufacturing DX",
    role: "Business Development Lead, Robotics",
    sector: "Manufacturing",
    channel: "Company career page",
    status: "applied",
    fitScore: 74,
    fitVerdict: "Good Fit",
    authorizationSignal: "silent",
    source: "https://example.com/jobs/torii-bd",
    stageHistory: history("applied", [6, 4]),
    // Deliberately the untailored generic CV, and no cover letter — this is
    // the pattern the CV & Cover Letters tab is meant to surface.
    files: [{ kind: "cv", filename: "cv_generic_product.pdf" }],
  },
  {
    company: "Cobalt Analytics",
    role: "AI Product Lead",
    sector: "Enterprise SaaS",
    channel: "TokyoDev",
    status: "rejected",
    fitScore: 65,
    fitVerdict: "Good Fit",
    authorizationSignal: "requires_sponsorship",
    source: "https://example.com/jobs/cobalt-ai-lead",
    stageHistory: history("rejected", [55, 51, 38]),
    files: [
      { kind: "cv", filename: "cv_generic_product.pdf" },
      { kind: "cover_letter", filename: "cover_cobalt_ai_lead.pdf" },
    ],
  },
  {
    company: "Harborlight Automation",
    role: "Director of Product, Industrial Autonomy",
    sector: "Robotics",
    channel: "Recruiter outreach",
    status: "no_response",
    fitScore: 80,
    fitVerdict: "Strong Fit",
    authorizationSignal: "domestic_only_implied",
    source: "https://example.com/jobs/harborlight-director",
    stageHistory: history("no_response", [45, 42]),
    files: [{ kind: "cv", filename: "cv_generic_product.pdf" }],
  },
  {
    company: "Meridian Oil & Gas Digital",
    role: "Senior Program Manager",
    sector: "Energy",
    channel: "LinkedIn",
    status: "draft",
    fitScore: 71,
    fitVerdict: "Good Fit",
    authorizationSignal: "silent",
    source: "https://example.com/jobs/meridian-spm",
    stageHistory: history("draft", [1]),
  },
  {
    company: "Aether Grid",
    role: "Head of Product, Grid AI",
    sector: "Energy",
    channel: "BizReach",
    status: "interview",
    fitScore: 85,
    fitVerdict: "Strong Fit",
    authorizationSignal: "pr_or_citizen_required",
    contactPerson: "Sana Ito",
    source: "https://example.com/jobs/aether-head-product",
    stageHistory: history("interview", [15, 13, 5]),
    files: [
      { kind: "cv", filename: "cv_aether_grid_ai.pdf" },
      { kind: "cover_letter", filename: "cover_aether_grid_ai.pdf" },
    ],
  },
  {
    company: "Quiet Foundry Robotics",
    role: "Product Manager, Fleet Systems",
    sector: "Robotics",
    channel: "Japan Dev",
    status: "withdrawn",
    fitScore: 58,
    fitVerdict: "Moderate Fit",
    authorizationSignal: "requires_sponsorship",
    source: "https://example.com/jobs/quiet-foundry-pm",
    stageHistory: history("withdrawn", [70, 65]),
    files: [
      { kind: "cv", filename: "cv_quiet_foundry_fleet.pdf" },
      { kind: "cover_letter", filename: "cover_quiet_foundry_fleet.pdf" },
    ],
  },
  {
    company: "Lucent Process Systems",
    role: "AI Transformation Program Manager",
    sector: "Manufacturing",
    channel: "Referral",
    status: "hired",
    fitScore: 90,
    fitVerdict: "Strong Fit",
    authorizationSignal: "pr_or_citizen_required",
    contactPerson: "Devon Price",
    source: "https://example.com/jobs/lucent-transformation-pm",
    stageHistory: history("hired", [95, 90, 78, 60, 50]),
    files: [
      { kind: "cv", filename: "cv_lucent_transformation.pdf" },
      { kind: "cover_letter", filename: "cover_lucent_transformation.pdf" },
    ],
  },
  {
    company: "Northgate Petrochemical",
    role: "Digital Program Lead",
    sector: "Energy",
    channel: "Company career page",
    status: "offer_declined",
    fitScore: 68,
    fitVerdict: "Good Fit",
    authorizationSignal: "domestic_only_implied",
    source: "https://example.com/jobs/northgate-digital-lead",
    stageHistory: history("offer_declined", [80, 74, 62, 48]),
  },
]

export async function loadSampleData(): Promise<number> {
  await clearAllApplications()
  for (const s of SAMPLE) {
    await createApplication(s)
  }
  return SAMPLE.length
}
