import { useState } from "react"
import { FileUp, Pencil, Mail, Phone, MapPin, Link as LinkIcon, Github, Linkedin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ImportResumeDialog } from "@/components/showcase/ImportResumeDialog"
import { ImportLinkedInDialog } from "@/components/showcase/ImportLinkedInDialog"
import { useProfile } from "@/hooks/useProfile"

function ContactRow({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  )
}

export function CareerShowcase() {
  const profile = useProfile()
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false)
  const [linkedInDialogOpen, setLinkedInDialogOpen] = useState(false)

  if (profile === undefined) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
  }

  if (profile === null) {
    return (
      <>
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Career Showcase</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Import a resume (PDF or DOCX) or your LinkedIn data export to build a profile view
              here. Extraction is heuristic — you review and correct everything before it's saved.
            </p>
            {/* Stated here rather than only inside the import dialog: the
                expectation "I'll just log in and it will pull my profile"
                forms before that dialog is ever opened. */}
            <p className="max-w-sm text-xs text-muted-foreground">
              The LinkedIn option reads the data export you download from LinkedIn yourself.
              There is no sign-in that imports your history — LinkedIn does not expose work
              history to third-party apps.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setResumeDialogOpen(true)}>
                <FileUp className="h-3.5 w-3.5" />
                Import resume
              </Button>
              <Button variant="outline" onClick={() => setLinkedInDialogOpen(true)}>
                <Linkedin className="h-3.5 w-3.5" />
                Import from LinkedIn
              </Button>
            </div>
          </CardContent>
        </Card>
        <ImportResumeDialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen} />
        <ImportLinkedInDialog open={linkedInDialogOpen} onOpenChange={setLinkedInDialogOpen} />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{profile.name || "Unnamed"}</h2>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {profile.email && <ContactRow icon={Mail}>{profile.email}</ContactRow>}
                {profile.phone && <ContactRow icon={Phone}>{profile.phone}</ContactRow>}
                {profile.location && <ContactRow icon={MapPin}>{profile.location}</ContactRow>}
                {profile.linkedin && <ContactRow icon={LinkIcon}>{profile.linkedin}</ContactRow>}
                {profile.github && <ContactRow icon={Github}>{profile.github}</ContactRow>}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => setLinkedInDialogOpen(true)}>
                <Linkedin className="h-3.5 w-3.5" />
                Import from LinkedIn
              </Button>
              <Button variant="outline" size="sm" onClick={() => setResumeDialogOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          </div>

          {profile.summary && <p className="text-sm">{profile.summary}</p>}
        </CardContent>
      </Card>

      {profile.experience.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Experience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.experience.map((entry, i) => (
              <div key={entry.id}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{entry.title || "—"}</div>
                  <div className="shrink-0 text-xs text-muted-foreground">{entry.dates}</div>
                </div>
                <div className="text-sm text-muted-foreground">{entry.company}</div>
                {entry.description && (
                  <p className="mt-1 whitespace-pre-line text-sm">{entry.description}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {profile.education.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Education</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.education.map((entry, i) => (
              <div key={entry.id}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">{entry.qualification || "—"}</div>
                  <div className="shrink-0 text-xs text-muted-foreground">{entry.dates}</div>
                </div>
                <div className="text-sm text-muted-foreground">{entry.institution}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {profile.skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Skills</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {profile.skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <ImportResumeDialog
        open={resumeDialogOpen}
        onOpenChange={setResumeDialogOpen}
        editingProfile={profile}
      />
      <ImportLinkedInDialog open={linkedInDialogOpen} onOpenChange={setLinkedInDialogOpen} />
    </div>
  )
}
