import { useState } from "react"
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { toast } from "sonner"

import { Column } from "./Column"
import { ClosedStatusDialog } from "./ClosedStatusDialog"
import { setStatus, deleteApplication } from "@/lib/db"
import { BOARD_COLUMNS, columnForStatus, type Application, type BoardColumn, type Status } from "@/lib/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const COLUMN_STATUS: Record<Exclude<BoardColumn, "closed">, Status> = {
  draft: "draft",
  applied: "applied",
  interview: "interview",
  offer: "offer",
  hired: "hired",
}

export function Board({
  apps,
  onOpen,
}: {
  apps: Application[]
  onOpen: (app: Application) => void
}) {
  const [pendingClose, setPendingClose] = useState<Application | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Application | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const byColumn = new Map<BoardColumn, Application[]>(BOARD_COLUMNS.map((c) => [c, []]))
  for (const app of apps) {
    byColumn.get(columnForStatus(app.status))!.push(app)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const app = apps.find((a) => a.id === active.id)
    if (!app) return
    const targetColumn = over.id as BoardColumn
    if (columnForStatus(app.status) === targetColumn) return

    if (targetColumn === "closed") {
      setPendingClose(app)
      return
    }

    const nextStatus = COLUMN_STATUS[targetColumn]
    await setStatus(app.id, nextStatus)
    toast.success(`${app.company} moved to ${nextStatus}`)
  }

  async function confirmClose(status: Status) {
    if (!pendingClose) return
    await setStatus(pendingClose.id, status)
    toast.success(`${pendingClose.company} marked ${status.replace("_", " ")}`)
    setPendingClose(null)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    await deleteApplication(pendingDelete.id)
    toast.success(`Deleted ${pendingDelete.role} at ${pendingDelete.company}`)
    setPendingDelete(null)
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((col) => (
            <Column
              key={col}
              id={col}
              apps={byColumn.get(col) ?? []}
              onOpen={onOpen}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      </DndContext>

      <ClosedStatusDialog
        open={pendingClose !== null}
        onOpenChange={(open) => !open && setPendingClose(null)}
        onChoose={confirmClose}
      />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this application?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  This removes <strong>{pendingDelete.role}</strong> at{" "}
                  <strong>{pendingDelete.company}</strong> permanently, including its notes and
                  stage history. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
