import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { Status } from "@/lib/types"

const CLOSED_CHOICES: { status: Status; label: string; hint: string }[] = [
  { status: "rejected", label: "Rejected", hint: "Explicit rejection at any stage" },
  { status: "no_response", label: "No response", hint: "Went quiet, no reply" },
  { status: "offer_declined", label: "Offer declined", hint: "Got an offer, turned it down" },
  { status: "withdrawn", label: "Withdrawn", hint: "You pulled out of the process" },
]

/** Dropping a card on the Kanban board's single "Closed" column is
 *  ambiguous — it collapses four distinct terminal statuses so the board
 *  stays scannable. This asks which one rather than guessing. */
export function ClosedStatusDialog({
  open,
  onOpenChange,
  onChoose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChoose: (status: Status) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>What was the outcome?</DialogTitle>
          <DialogDescription>
            "Closed" covers a few different endings — pick the one that fits.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {CLOSED_CHOICES.map((c) => (
            <Button
              key={c.status}
              variant="outline"
              className="h-auto flex-col items-start gap-0.5 py-2"
              onClick={() => onChoose(c.status)}
            >
              <span className="text-sm font-medium">{c.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{c.hint}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
