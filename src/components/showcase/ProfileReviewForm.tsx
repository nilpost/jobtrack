import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent } from "@/components/ui/card"
import type { CandidateProfile, EducationEntry, ExperienceEntry } from "@/lib/profileTypes"

type Draft = Omit<CandidateProfile, "updatedAt" | "skills"> & { skillsText: string }

export function profileToDraft(profile: Omit<CandidateProfile, "updatedAt">): Draft {
  return { ...profile, skillsText: profile.skills.join(", ") }
}

export function draftToProfile(draft: Draft): Omit<CandidateProfile, "updatedAt"> {
  const { skillsText, ...rest } = draft
  return {
    ...rest,
    skills: skillsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean),
  }
}

function newExperience(): ExperienceEntry {
  return { id: crypto.randomUUID(), title: "", company: "", dates: "", description: "" }
}

function newEducation(): EducationEntry {
  return { id: crypto.randomUUID(), qualification: "", institution: "", dates: "" }
}

/**
 * Shared between "review an extracted resume draft" and "edit the saved
 * profile" — same fields, same editing affordances, so there is exactly
 * one place this form's behavior lives.
 */
export function ProfileReviewForm({
  draft,
  onChange,
}: {
  draft: Draft
  onChange: (next: Draft) => void
}) {
  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    onChange({ ...draft, [key]: value })
  }

  function updateExperience(id: string, patch: Partial<ExperienceEntry>) {
    setField(
      "experience",
      draft.experience.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    )
  }

  function updateEducation(id: string, patch: Partial<EducationEntry>) {
    setField(
      "education",
      draft.education.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={draft.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={draft.email ?? ""} onChange={(e) => setField("email", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={draft.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Input
            value={draft.location ?? ""}
            onChange={(e) => setField("location", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>LinkedIn</Label>
          <Input value={draft.linkedin ?? ""} onChange={(e) => setField("linkedin", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>GitHub</Label>
          <Input value={draft.github ?? ""} onChange={(e) => setField("github", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Portfolio</Label>
          <Input
            value={draft.portfolio ?? ""}
            onChange={(e) => setField("portfolio", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Summary</Label>
        <Textarea
          value={draft.summary ?? ""}
          onChange={(e) => setField("summary", e.target.value)}
          className="min-h-16"
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Experience</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setField("experience", [...draft.experience, newExperience()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add role
          </Button>
        </div>
        {draft.experience.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nothing detected — add roles manually, or check the resume has a recognizable
            "Experience" heading.
          </p>
        )}
        {draft.experience.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="space-y-2 p-3">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Title"
                  value={entry.title}
                  onChange={(e) => updateExperience(entry.id, { title: e.target.value })}
                />
                <Input
                  placeholder="Company"
                  value={entry.company}
                  onChange={(e) => updateExperience(entry.id, { company: e.target.value })}
                />
              </div>
              <Input
                placeholder="Dates, e.g. Jan 2020 – Present"
                value={entry.dates}
                onChange={(e) => updateExperience(entry.id, { dates: e.target.value })}
              />
              <Textarea
                placeholder="Description"
                value={entry.description}
                onChange={(e) => updateExperience(entry.id, { description: e.target.value })}
                className="min-h-14"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() =>
                  setField(
                    "experience",
                    draft.experience.filter((e) => e.id !== entry.id),
                  )
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Education</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setField("education", [...draft.education, newEducation()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        {draft.education.length === 0 && (
          <p className="text-xs text-muted-foreground">Nothing detected — add manually if needed.</p>
        )}
        {draft.education.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="space-y-2 p-3">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Qualification"
                  value={entry.qualification}
                  onChange={(e) => updateEducation(entry.id, { qualification: e.target.value })}
                />
                <Input
                  placeholder="Institution"
                  value={entry.institution}
                  onChange={(e) => updateEducation(entry.id, { institution: e.target.value })}
                />
              </div>
              <Input
                placeholder="Dates"
                value={entry.dates}
                onChange={(e) => updateEducation(entry.id, { dates: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() =>
                  setField(
                    "education",
                    draft.education.filter((e) => e.id !== entry.id),
                  )
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label>Skills</Label>
        <Textarea
          placeholder="Comma or newline separated"
          value={draft.skillsText}
          onChange={(e) => setField("skillsText", e.target.value)}
          className="min-h-14"
        />
      </div>
    </div>
  )
}

export type { Draft as ProfileDraft }
