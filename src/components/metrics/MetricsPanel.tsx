import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  computeFunnel,
  medianDaysToFirstResponse,
  rejectionRate,
  responseRate,
  staleApplications,
  statsByAuthorizationSignal,
  statsByChannel,
  type Rate,
} from "@/lib/metrics"
import type { Application } from "@/lib/types"

function RateStat({ label, rate }: { label: string; rate: Rate }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{rate.pct === null ? "—" : `${rate.pct}%`}</div>
        <p className="text-xs text-muted-foreground">
          {rate.count} of {rate.of}
        </p>
      </CardContent>
    </Card>
  )
}

const FUNNEL_COLORS = [
  "hsl(var(--status-applied))",
  "hsl(var(--status-interview))",
  "hsl(var(--status-offer))",
  "hsl(var(--status-hired))",
]

export function MetricsPanel({ apps }: { apps: Application[] }) {
  const funnel = computeFunnel(apps)
  const response = responseRate(apps)
  const rejection = rejectionRate(apps)
  const medianDays = medianDaysToFirstResponse(apps)
  const channels = statsByChannel(apps)
  const authSignals = statsByAuthorizationSignal(apps)
  const stale = staleApplications(apps)

  if (apps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No applications yet — metrics will appear once you add some.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RateStat label="Response rate" rate={response} />
        <RateStat label="Rejection rate" rate={rejection} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Median time to response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{medianDays === null ? "—" : `${medianDays}d`}</div>
            <p className="text-xs text-muted-foreground">days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Needs follow-up
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stale.length}</div>
            <p className="text-xs text-muted-foreground">30+ days quiet</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnel} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {funnel.map((entry, i) => (
                  <Cell key={entry.status} fill={FUNNEL_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Response rate by channel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {channels.length === 0 && (
              <p className="text-xs text-muted-foreground">No channel data yet.</p>
            )}
            {channels.map((c) => (
              <div key={c.channel} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{c.channel}</span>
                <span className="font-medium">
                  {c.responseRate.pct === null ? "—" : `${c.responseRate.pct}%`}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({c.responseRate.count}/{c.responseRate.of})
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Response rate by authorization signal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="mb-1 text-xs text-muted-foreground">
              Tests whether a posting's stated work-authorization requirement moves your
              response rate.
            </p>
            {authSignals.map((s) => (
              <div key={s.signal} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.signal.replace(/_/g, " ")}</span>
                <span className="font-medium">
                  {s.responseRate.pct === null ? "—" : `${s.responseRate.pct}%`}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({s.responseRate.count}/{s.responseRate.of})
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
