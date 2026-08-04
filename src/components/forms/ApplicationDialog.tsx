import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/status-badge"
import { applicationFormSchema, type ApplicationFormValues } from "@/lib/schema"
import { createApplication, updateApplication, addNote } from "@/lib/db"
import { STATUSES, STATUS_LABELS, AUTHORIZATION_SIGNALS, type Application } from "@/lib/types"

const AUTHORIZATION_LABELS: Record<string, string> = {
  requires_sponsorship: "Sponsorship offered",
  pr_or_citizen_required: "PR / citizen required",
  domestic_only_implied: "Domestic only (implied)",
  silent: "Not stated",
}

function toFormValues(app?: Application): ApplicationFormValues {
  return {
    company: app?.company ?? "",
    role: app?.role ?? "",
    roleType: app?.roleType ?? "",
    sector: app?.sector ?? "",
    channel: app?.channel ?? "",
    status: app?.status ?? "draft",
    fitScore: app?.fitScore,
    authorizationSignal: app?.authorizationSignal,
    contactPerson: app?.contactPerson ?? "",
    source: app?.source ?? "",
  }
}

export function ApplicationDialog({
  open,
  onOpenChange,
  application,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present -> edit mode. Absent -> create mode. */
  application?: Application
}) {
  const isEdit = !!application
  const [newNote, setNewNote] = useState("")

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: toFormValues(application),
  })

  useEffect(() => {
    form.reset(toFormValues(application))
    setNewNote("")
  }, [application, open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(values: ApplicationFormValues) {
    if (isEdit) {
      await updateApplication(application.id, values)
      toast.success("Application updated")
    } else {
      await createApplication(values)
      toast.success(`Added ${values.role} at ${values.company}`)
    }
    onOpenChange(false)
  }

  async function handleAddNote() {
    if (!application || !newNote.trim()) return
    await addNote(application.id, newNote.trim())
    setNewNote("")
    toast.success("Note added")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit application" : "Add application"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="company">Company *</Label>
              <Input id="company" {...form.register("company")} />
              {form.formState.errors.company && (
                <p className="text-xs text-destructive">{form.formState.errors.company.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role *</Label>
              <Input id="role" {...form.register("role")} />
              {form.formState.errors.role && (
                <p className="text-xs text-destructive">{form.formState.errors.role.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sector">Sector</Label>
              <Input id="sector" {...form.register("sector")} placeholder="e.g. Fintech" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roleType">Role type</Label>
              <Input id="roleType" {...form.register("roleType")} placeholder="e.g. Full-time" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="channel">Channel</Label>
              <Input id="channel" {...form.register("channel")} placeholder="e.g. Referral" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v as ApplicationFormValues["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fitScore">Fit score (0-100)</Label>
              <Input id="fitScore" type="number" min={0} max={100} {...form.register("fitScore")} />
            </div>
            <div className="space-y-1.5">
              <Label>Work authorization signal</Label>
              <Select
                value={form.watch("authorizationSignal") ?? "__none"}
                onValueChange={(v) =>
                  form.setValue(
                    "authorizationSignal",
                    v === "__none" ? undefined : (v as ApplicationFormValues["authorizationSignal"]),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not recorded</SelectItem>
                  {AUTHORIZATION_SIGNALS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {AUTHORIZATION_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contactPerson">Contact person</Label>
              <Input id="contactPerson" {...form.register("contactPerson")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Posting URL</Label>
              <Input id="source" {...form.register("source")} placeholder="https://" />
              {form.formState.errors.source && (
                <p className="text-xs text-destructive">{form.formState.errors.source.message}</p>
              )}
            </div>
          </div>

          {isEdit && application && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Stage history</Label>
                <div className="flex flex-wrap gap-1.5">
                  {application.stageHistory.map((h, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <StatusBadge status={h.status} />
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(h.at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <div className="max-h-32 space-y-1.5 overflow-y-auto">
                  {application.notes.length === 0 && (
                    <p className="text-xs text-muted-foreground">No notes yet.</p>
                  )}
                  {application.notes.map((n, i) => (
                    <div key={i} className="rounded-md bg-muted/50 p-2 text-xs">
                      <div className="mb-0.5 text-muted-foreground">
                        {new Date(n.at).toLocaleDateString()}
                      </div>
                      {n.text}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note..."
                    className="min-h-9"
                  />
                  <Button type="button" variant="outline" onClick={handleAddNote}>
                    Add
                  </Button>
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="submit">{isEdit ? "Save changes" : "Add application"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
