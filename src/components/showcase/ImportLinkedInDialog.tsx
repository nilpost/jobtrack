import { useRef, useState } from "react"
import { toast } from "sonner"
import { FileUp, Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { loadLinkedInExport } from "@/lib/importers/linkedin"
import { saveProfile } from "@/lib/db"
import { emptyProfile } from "@/lib/profileTypes"
import { ProfileReviewForm, draftToProfile, profileToDraft, type ProfileDraft } from "./ProfileReviewForm"

type Stage = "upload" | "extracting" | "review"

/**
 * Imports LinkedIn's own "Get a copy of your data" export. Distinct from
 * "Sign in with LinkedIn" (identity-only OAuth, not built here) — this is
 * the adapter that actually brings in work history, since that data isn't
 * available through any API LinkedIn opens to third-party apps. See
 * lib/importers/linkedin.ts.
 *
 * Same upload -> extracting -> review shape as ImportResumeDialog, and
 * feeds the same ProfileReviewForm — every import source lands in one
 * review step before anything is saved.
 */
export function ImportLinkedInDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>("upload")
  const [draft, setDraft] = useState<ProfileDraft>(() => profileToDraft(emptyProfile()))
  const [fileName, setFileName] = useState<string | null>(null)

  function reset() {
    setStage("upload")
    setDraft(profileToDraft(emptyProfile()))
    setFileName(null)
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    setStage("extracting")
    try {
      const { draft: parsed, errors } = await loadLinkedInExport(file)
      setDraft(profileToDraft(parsed))
      setStage("review")
      if (errors.length > 0) {
        toast.warning("Imported with some gaps — review before saving", {
          description: errors.join("; "),
        })
      } else {
        toast.info("Extracted a draft — review and correct before saving.")
      }
    } catch (err) {
      toast.error("Couldn't read that export", {
        description: err instanceof Error ? err.message : String(err),
      })
      setStage("upload")
    }
  }

  async function handleSave() {
    await saveProfile(draftToProfile(draft))
    toast.success("Profile saved")
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from LinkedIn</DialogTitle>
          <DialogDescription>
            {stage === "upload" &&
              'Upload the .zip from LinkedIn\'s "Get a copy of your data" export (Settings & Privacy → Data privacy → Get a copy of your data). jobtrack never scrapes or connects to LinkedIn directly — this file is the only path to your work history, since LinkedIn doesn\'t expose that to third-party apps. You\'ll review everything before it\'s saved.'}
            {stage === "extracting" && `Reading ${fileName}…`}
            {stage === "review" && "Review what was extracted. Fix anything wrong, then save."}
          </DialogDescription>
        </DialogHeader>

        {stage === "upload" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10">
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ""
              }}
            />
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <Button type="button" onClick={() => fileInput.current?.click()}>
              Choose your LinkedIn export (.zip)
            </Button>
            <p className="text-xs text-muted-foreground">
              Don't have one yet? Request it from LinkedIn — exports can take up to a day to
              prepare.
            </p>
          </div>
        )}

        {stage === "extracting" && (
          <div className="flex flex-col items-center gap-3 p-10 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Reading export and parsing profile data…</p>
          </div>
        )}

        {stage === "review" && <ProfileReviewForm draft={draft} onChange={setDraft} />}

        {stage === "review" && (
          <DialogFooter>
            <Button onClick={handleSave}>Save profile</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
