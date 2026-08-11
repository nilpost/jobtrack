import { useState } from "react"
import { toast } from "sonner"
import { Workflow } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  enrichFromSeenJobs,
  mergeImport,
  parseJobAgentTracker,
  toNewApplications,
  type JobAgentSeenJobsFile,
} from "@/lib/importers/jobAgent"
import { createApplication, setStatus, updateApplication } from "@/lib/db"
import type { Application } from "@/lib/types"

export function ImportJobAgentDialog({
  open,
  onOpenChange,
  existingApps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingApps: Application[]
}) {
  const [trackerFile, setTrackerFile] = useState<File | null>(null)
  const [seenJobsFile, setSeenJobsFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setTrackerFile(null)
    setSeenJobsFile(null)
  }

  async function handleImport() {
    if (!trackerFile) return
    setBusy(true)
    try {
      const csvText = await trackerFile.text()
      const { rows, errors } = parseJobAgentTracker(csvText)

      let seenJobs: JobAgentSeenJobsFile | undefined
      if (seenJobsFile) {
        try {
          seenJobs = JSON.parse(await seenJobsFile.text()) as JobAgentSeenJobsFile
        } catch {
          errors.push("seen_jobs.json could not be parsed — importing tracker data without enrichment")
        }
      }

      const enriched = enrichFromSeenJobs(rows, seenJobs)
      const imported = toNewApplications(enriched)
      const plan = mergeImport(existingApps, imported)
      const byId = new Map(existingApps.map((a) => [a.id, a]))

      let created = 0
      let updated = 0
      let unchanged = 0

      for (const entry of plan) {
        if (entry.action === "create") {
          await createApplication(entry.application)
          created++
          continue
        }

        const current = byId.get(entry.id)
        if (!current) continue // shouldn't happen — mergeImport matched against this same list

        const hasFieldChanges = Object.keys(entry.patch).length > 0
        const hasNewNotes = entry.newNotes.length > 0
        const hasNewFiles = entry.newFiles.length > 0

        if (!entry.statusChange && !hasFieldChanges && !hasNewNotes && !hasNewFiles) {
          unchanged++
          continue
        }

        if (entry.statusChange) {
          await setStatus(entry.id, entry.statusChange)
        }
        if (hasFieldChanges || hasNewNotes || hasNewFiles) {
          await updateApplication(entry.id, {
            ...entry.patch,
            ...(hasNewNotes ? { notes: [...current.notes, ...entry.newNotes] } : {}),
            ...(hasNewFiles ? { files: [...current.files, ...entry.newFiles] } : {}),
          })
        }
        updated++
      }

      const summary = `${created} created, ${updated} updated, ${unchanged} unchanged`
      if (errors.length > 0) {
        toast.warning(`Imported from job-agent: ${summary}`, {
          description: `${errors.length} issue(s): ${errors.slice(0, 3).join("; ")}`,
        })
      } else {
        toast.success(`Imported from job-agent: ${summary}`)
      }
      reset()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import from job-agent</DialogTitle>
          <DialogDescription>
            Reads job-agent's own tracker files. Nothing is written back to them — this is a
            one-way, re-runnable import. Re-running is safe: matching applications (by company +
            role) are updated in place, not duplicated, and job-agent's status always wins on
            conflict since it's the system of record for what actually happened.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tracker-csv">job_search_tracker.csv (required)</Label>
            <input
              id="tracker-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setTrackerFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="seen-jobs-json">
              job_scraper/seen_jobs.json <span className="text-muted-foreground">(optional)</span>
            </Label>
            <input
              id="seen-jobs-json"
              type="file"
              accept=".json,application/json"
              onChange={(e) => setSeenJobsFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <p className="text-xs text-muted-foreground">
              Adds fit score, verdict, and work-authorization signal to matched applications.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleImport} disabled={!trackerFile || busy}>
            <Workflow className="h-3.5 w-3.5" />
            {busy ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
