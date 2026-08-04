import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

import { ApplicationCard } from "./ApplicationCard"
import { cn } from "@/lib/utils"
import { BOARD_COLUMN_LABELS, type Application, type BoardColumn } from "@/lib/types"

const COLUMN_DOT: Record<BoardColumn, string> = {
  draft: "bg-status-draft",
  applied: "bg-status-applied",
  interview: "bg-status-interview",
  offer: "bg-status-offer",
  hired: "bg-status-hired",
  closed: "bg-status-closed",
}

export function Column({
  id,
  apps,
  onOpen,
  onDelete,
}: {
  id: BoardColumn
  apps: Application[]
  onOpen: (app: Application) => void
  onDelete: (app: Application) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={cn("h-2 w-2 rounded-full", COLUMN_DOT[id])} />
        <h3 className="text-sm font-semibold">{BOARD_COLUMN_LABELS[id]}</h3>
        <span className="ml-auto text-xs text-muted-foreground">{apps.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-b-lg p-2 transition-colors",
          isOver && "bg-accent/60",
        )}
      >
        <SortableContext items={apps.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {apps.map((app) => (
            <ApplicationCard key={app.id} app={app} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </SortableContext>
        {apps.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            No applications
          </div>
        )}
      </div>
    </div>
  )
}
