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
import { extractResumeText, parseResumeText } from "@/lib/importers/resume"
import { saveProfile } from "@/lib/db"
import { emptyProfile, type CandidateProfile } from "@/lib/profileTypes"
import { ProfileReviewForm, draftToProfile, profileToDraft, type ProfileDraft } from "./ProfileReviewForm"

type Stage = "upload" | "extracting" | "review"

export function ImportResumeDialog({
  open,
  onOpenChange,
  /** When set, skips the upload step and opens straight into the review
   *  form pre-filled with the existing profile — reuses this dialog for
   *  "edit my saved profile" as well as "review a fresh extraction". */
  editingProfile,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingProfile?: CandidateProfile
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>(editingProfile ? "review" : "upload")
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    profileToDraft(editingProfile ?? emptyProfile()),
  )
  const [fileName, setFileName] = useState<string | null>(null)

  function reset() {
    setStage(editingProfile ? "review" : "upload")
    setDraft(profileToDraft(editingProfile ?? emptyProfile()))
    setFileName(null)
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    setStage("extracting")
    try {
      const text = await extractResumeText(file)
      const parsed = parseResumeText(text)
      setDraft(profileToDraft(parsed))
      setStage("review")
      toast.info("Extracted a draft — review and correct before saving.", {
        description: "Resume layouts vary, so this is a starting point, not a finished profile.",
      })
    } catch (err) {
      toast.error("Couldn't read that file", {
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
          <DialogTitle>{editingProfile ? "Edit profile" : "Import your resume"}</DialogTitle>
          <DialogDescription>
            {stage === "upload" &&
              "PDF or DOCX. Extraction is heuristic — you'll review and correct everything before it's saved. Nothing is saved automatically."}
            {stage === "extracting" && `Reading ${fileName}…`}
            {stage === "review" &&
              !editingProfile &&
              "Review what was extracted. Fix anything wrong, then save."}
            {stage === "review" && editingProfile && "Edit your saved profile."}
          </DialogDescription>
        </DialogHeader>

        {stage === "upload" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10">
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ""
              }}
            />
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <Button type="button" onClick={() => fileInput.current?.click()}>
              Choose a resume file
            </Button>
            <p className="text-xs text-muted-foreground">.pdf or .docx</p>
          </div>
        )}

        {stage === "extracting" && (
          <div className="flex flex-col items-center gap-3 p-10 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Extracting text and parsing sections…</p>
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
