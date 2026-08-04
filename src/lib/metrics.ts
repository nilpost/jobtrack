import type { Application, Status } from "./types"

/** Every rate carries its raw count — a personal job search is dozens of
 *  data points, not thousands, and "75%" alone on a 3-application sample is
 *  actively misleading. */
export interface Rate {
  count: number
  of: number
  pct: number | null // null when `of` is 0 — nothing to divide
}

function rate(count: number, of: number): Rate {
  return { count, of, pct: of > 0 ? Math.round((count / of) * 1000) / 10 : null }
}

export interface FunnelStage {
  status: Status
  label: string
  count: number
}

/** How many applications ever reached at least this stage, cumulative —
 *  the standard funnel-chart shape (applied -> interview -> offer -> hired). */
export function computeFunnel(apps: Application[]): FunnelStage[] {
  const reached = (status: Status) =>
    apps.filter((a) => a.stageHistory.some((h) => h.status === status)).length

  return [
    { status: "applied", label: "Applied", count: reached("applied") },
    { status: "interview", label: "Interview", count: reached("interview") },
    { status: "offer", label: "Offer", count: reached("offer") },
    { status: "hired", label: "Hired", count: reached("hired") },
  ]
}

/** Applications that reached "applied" and got ANY employer response
 *  (moved past applied — interview, offer, rejection, etc.) vs. those still
 *  waiting or marked no_response. */
export function responseRate(apps: Application[]): Rate {
  const applied = apps.filter((a) => a.stageHistory.some((h) => h.status === "applied"))
  const responded = applied.filter((a) =>
    a.stageHistory.some((h) => h.status !== "draft" && h.status !== "applied"),
  )
  return rate(responded.length, applied.length)
}

export function rejectionRate(apps: Application[]): Rate {
  const applied = apps.filter((a) => a.stageHistory.some((h) => h.status === "applied"))
  const rejected = applied.filter((a) => a.status === "rejected")
  return rate(rejected.length, applied.length)
}

/** Days between "applied" and the first subsequent status change — the
 *  first real employer signal. Null when there is no response yet. */
export function daysToFirstResponse(app: Application): number | null {
  const appliedEvent = app.stageHistory.find((h) => h.status === "applied")
  if (!appliedEvent) return null
  const next = app.stageHistory.find(
    (h) => new Date(h.at).getTime() > new Date(appliedEvent.at).getTime(),
  )
  if (!next) return null
  const ms = new Date(next.at).getTime() - new Date(appliedEvent.at).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function medianDaysToFirstResponse(apps: Application[]): number | null {
  const values = apps
    .map(daysToFirstResponse)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)
  if (values.length === 0) return null
  const mid = Math.floor(values.length / 2)
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid]
}

/** Days currently spent in the application's present status. */
export function daysInCurrentStage(app: Application): number {
  const last = app.stageHistory[app.stageHistory.length - 1]
  const since = last ? new Date(last.at).getTime() : new Date(app.createdAt).getTime()
  return Math.round((Date.now() - since) / (1000 * 60 * 60 * 24))
}

export interface ChannelStats {
  channel: string
  total: number
  responseRate: Rate
}

export function statsByChannel(apps: Application[]): ChannelStats[] {
  const byChannel = new Map<string, Application[]>()
  for (const a of apps) {
    const key = a.channel?.trim() || "Unknown"
    byChannel.set(key, [...(byChannel.get(key) ?? []), a])
  }
  return Array.from(byChannel.entries())
    .map(([channel, group]) => ({
      channel,
      total: group.length,
      responseRate: responseRate(group),
    }))
    .sort((a, b) => b.total - a.total)
}

export interface AuthorizationSignalStats {
  signal: string
  total: number
  responseRate: Rate
}

/** Segments response rate by the posting's work-authorization signal — the
 *  concrete test of whether a PR/authorization edge actually moves outcomes,
 *  rather than remaining an unmeasured assumption. */
export function statsByAuthorizationSignal(apps: Application[]): AuthorizationSignalStats[] {
  const byGroup = new Map<string, Application[]>()
  for (const a of apps) {
    const key = a.authorizationSignal ?? "unrecorded"
    byGroup.set(key, [...(byGroup.get(key) ?? []), a])
  }
  return Array.from(byGroup.entries())
    .map(([signal, group]) => ({
      signal,
      total: group.length,
      responseRate: responseRate(group),
    }))
    .sort((a, b) => b.total - a.total)
}

/** Applications with no activity in `staleDays` — same 30-day default
 *  job-agent's /gmail-sync flags. Closed applications are never stale. */
export function staleApplications(apps: Application[], staleDays = 30): Application[] {
  return apps.filter((a) => {
    if (!isOpenStatus(a.status)) return false
    return daysInCurrentStage(a) >= staleDays
  })
}

function isOpenStatus(status: Status): boolean {
  return status === "draft" || status === "applied" || status === "interview" || status === "offer"
}
