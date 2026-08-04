import { useRef } from "react"
import { toast } from "sonner"
import { Download, Upload, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { downloadCSV, exportToCSV, parseJobtrackCSV } from "@/lib/csv"
import { createApplication } from "@/lib/db"
import { loadSampleData } from "@/lib/sampleData"
import type { Application } from "@/lib/types"

export function ImportExportMenu({ apps }: { apps: Application[] }) {
  const fileInput = useRef<HTMLInputElement>(null)

  function handleExport() {
    if (apps.length === 0) {
      toast.error("Nothing to export yet")
      return
    }
    const csv = exportToCSV(apps)
    const date = new Date().toISOString().slice(0, 10)
    downloadCSV(csv, `jobtrack-export-${date}.csv`)
    toast.success(`Exported ${apps.length} applications`)
  }

  async function handleImportFile(file: File) {
    const text = await file.text()
    const { applications, errors } = parseJobtrackCSV(text)

    const existingIds = new Set(apps.map((a) => a.id))
    let imported = 0
    for (const app of applications) {
      if (existingIds.has(app.id)) continue // avoid duplicating an already-imported row
      await createApplication(app)
      imported++
    }

    if (errors.length > 0) {
      toast.warning(`Imported ${imported} rows, ${errors.length} skipped`, {
        description: errors.slice(0, 3).join("; "),
      })
    } else {
      toast.success(`Imported ${imported} applications`)
    }
  }

  async function handleLoadSample() {
    const n = await loadSampleData()
    toast.success(`Loaded ${n} sample applications`, {
      description: "This replaced any existing data in this browser.",
    })
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImportFile(file)
          e.target.value = ""
        }}
      />
      <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
        <Upload className="h-3.5 w-3.5" />
        Import CSV
      </Button>
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>
      {apps.length === 0 && (
        <Button variant="secondary" size="sm" onClick={handleLoadSample}>
          <Sparkles className="h-3.5 w-3.5" />
          Load sample data
        </Button>
      )}
    </div>
  )
}
