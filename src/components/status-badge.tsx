import { cn } from "@/lib/utils"
import { STATUS_LABELS, type Status } from "@/lib/types"

const STATUS_DOT: Record<Status, string> = {
  draft: "bg-status-draft",
  applied: "bg-status-applied",
  interview: "bg-status-interview",
  offer: "bg-status-offer",
  hired: "bg-status-hired",
  rejected: "bg-status-closed",
  no_response: "bg-status-closed",
  offer_declined: "bg-status-closed",
  withdrawn: "bg-status-closed",
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABELS[status]}
    </span>
  )
}
