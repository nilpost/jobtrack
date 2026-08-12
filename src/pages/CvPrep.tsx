import { useState } from "react"
import { FileText, FileWarning, Copy, Pencil } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/status-badge"
import { ApplicationDialog } from "@/components/forms/ApplicationDialog"
import { useApplications } from "@/hooks/useApplications"
import {
  applicationsMissingDocuments,
  documentCoverage,
  hasAnyRecordedDocument,
  reusedDocuments,
} from "@/lib/documents"
import type { Rate } from "@/lib/metrics"
import type { Application, FileKind } from "@/lib/types"

const KIND_LABELS: Record<FileKind, string> = {
  cv: "CV",
  cover_letter: "Cover letter",
}

/** Spelled out rather than derived from KIND_LABELS — lowercasing that map
 *  turns the "CV" acronym into "cv". */
const MISSING_LABELS: Record<FileKind, string> = {
  cv: "No CV",
  cover_letter: "No cover letter",
}

function CoverageStat({ label, rate }: { label: string; rate: Rate }) {
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

/**
 * Tab 2 — the materials view. Everything here is derived from filenames
 * recorded on applications; jobtrack never holds the documents themselves,
 * so this reports what it can actually see (coverage, gaps, reuse) and does
 * not claim to judge a document's content or its fit to a posting.
 */
export function CvPrep() {
  const apps = useApplications()
  const [editing, setEditing] = useState<Application | undefined>(undefined)
  const [dialogOpen, setDialogOpen] = useState(false)

  function onOpenApplication(app: Application) {
    setEditing(app)
    setDialogOpen(true)
  }

  if (apps === undefined) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
  }

  const coverage = documentCoverage(apps)
  const missing = applicationsMissingDocuments(apps)
  const reused = reusedDocuments(apps)
  const anyRecorded = hasAnyRecordedDocument(apps)

  if (apps.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">CV &amp; Cover Letters</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No applications yet. Once you add some, this tab tracks which ones have materials
          attached and where the gaps are.
        </CardContent>
      </Card>
    )
  }

  // Zero coverage because nothing was ever recorded is a different situation
  // from zero coverage across real applications — showing "0%" for the
  // former reads as a failure that hasn't actually happened.
  if (!anyRecorded) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">CV &amp; Cover Letters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            No document filenames recorded yet, so there's nothing to report. Add a CV or cover
            letter filename to an application (Pipeline → open a card → CV file / Cover letter
            file) and coverage, gaps, and reuse will show up here.
          </p>
          <p>
            Importing from job-agent fills these in automatically from its{" "}
            <code className="text-xs">cv_file</code> and{" "}
            <code className="text-xs">cover_letter_file</code> columns.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CoverageStat label="Has a CV" rate={coverage.cv} />
        <CoverageStat label="Has a cover letter" rate={coverage.coverLetter} />
        <CoverageStat label="Has both" rate={coverage.both} />
      </div>
      <p className="text-xs text-muted-foreground">
        Measured across the {coverage.submitted} application
        {coverage.submitted === 1 ? "" : "s"} you've actually submitted — drafts are excluded,
        since they aren't expected to have materials yet.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileWarning className="h-4 w-4" />
            Missing materials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {missing.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Every submitted application has both a CV and a cover letter recorded.
            </p>
          )}
          {missing.map(({ application, missing: kinds }, i) => (
            <div key={application.id}>
              {i > 0 && <Separator className="mb-2" />}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{application.role}</span>
                    <StatusBadge status={application.status} />
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {application.company}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {kinds.map((kind) => (
                    <Badge key={kind} variant="outline" className="text-destructive">
                      {MISSING_LABELS[kind]}
                    </Badge>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenApplication(application)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Copy className="h-4 w-4" />
            Reused across applications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Reuse isn't automatically a problem — one strong CV across near-identical roles is a
            real strategy. But jobtrack only sees filenames, not content, so a single file
            spanning several unrelated companies is worth a second look.
          </p>
          {reused.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Every recorded document is used by exactly one application.
            </p>
          )}
          {reused.map((doc) => (
            <div key={`${doc.kind}-${doc.filename}`} className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{doc.filename}</span>
                <Badge variant="secondary" className="shrink-0">
                  {KIND_LABELS[doc.kind]}
                </Badge>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {doc.applications.length} applications
                </span>
              </div>
              <div className="pl-5 text-xs text-muted-foreground">
                {doc.applications.map((a) => a.company).join(", ")}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <ApplicationDialog open={dialogOpen} onOpenChange={setDialogOpen} application={editing} />
    </div>
  )
}
