import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Building2, Globe2, MoreVertical, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { daysInCurrentStage } from "@/lib/metrics"
import type { Application } from "@/lib/types"

const AUTHORIZATION_LABEL: Record<NonNullable<Application["authorizationSignal"]>, string> = {
  requires_sponsorship: "Sponsorship offered",
  pr_or_citizen_required: "PR/citizen required",
  domestic_only_implied: "Domestic only (implied)",
  silent: "No auth. signal",
}

export function ApplicationCard({
  app,
  onOpen,
  onDelete,
}: {
  app: Application
  onOpen: (app: Application) => void
  onDelete: (app: Application) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: app.id,
    data: { app },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const days = daysInCurrentStage(app)

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab touch-none select-none active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
      {...attributes}
      {...listeners}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(app)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 text-left"
          >
            <div className="truncate text-sm font-medium leading-tight">{app.role}</div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" />
              {app.company}
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              onPointerDown={(e) => e.stopPropagation()}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onPointerDown={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onOpen(app)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(app)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {app.fitScore !== undefined && (
            <Badge variant="secondary" className="text-[10px]">
              {app.fitScore}/100
            </Badge>
          )}
          {app.authorizationSignal && app.authorizationSignal !== "silent" && (
            <Badge
              variant="outline"
              className="flex items-center gap-1 text-[10px]"
              title={AUTHORIZATION_LABEL[app.authorizationSignal]}
            >
              <Globe2 className="h-2.5 w-2.5" />
              {app.authorizationSignal === "pr_or_citizen_required" ? "PR req." : "Sponsor"}
            </Badge>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground">
          {days === 0 ? "Today" : `${days}d in this stage`}
        </div>
      </CardContent>
    </Card>
  )
}
