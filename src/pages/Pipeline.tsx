import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Board } from "@/components/board/Board"
import { MetricsPanel } from "@/components/metrics/MetricsPanel"
import { ApplicationDialog } from "@/components/forms/ApplicationDialog"
import { ImportExportMenu } from "@/components/forms/ImportExportMenu"
import { useApplications } from "@/hooks/useApplications"
import type { Application } from "@/lib/types"

export function Pipeline() {
  const apps = useApplications()
  const [editing, setEditing] = useState<Application | undefined>(undefined)
  const [dialogOpen, setDialogOpen] = useState(false)

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(app: Application) {
    setEditing(app)
    setDialogOpen(true)
  }

  if (apps === undefined) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            {apps.length} application{apps.length === 1 ? "" : "s"} tracked locally in this
            browser.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportMenu apps={apps} />
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Add application
          </Button>
        </div>
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          <Board apps={apps} onOpen={openEdit} />
        </TabsContent>
        <TabsContent value="metrics">
          <MetricsPanel apps={apps} />
        </TabsContent>
      </Tabs>

      <ApplicationDialog open={dialogOpen} onOpenChange={setDialogOpen} application={editing} />
    </div>
  )
}
