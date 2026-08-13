import { useState } from "react"
import { Search, AlertTriangle, CheckCircle2, Info, FileText } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { analyseKeywords, type KeywordAnalysis, type TermFinding } from "@/lib/analysis/keywords"
import {
  analyseProfileBullets,
  summariseBullets,
  BULLET_ISSUE_LABELS,
  type BulletFinding,
} from "@/lib/analysis/bullets"
import type { CandidateProfile } from "@/lib/profileTypes"

/**
 * Deterministic CV analysis — runs entirely in this browser, with no model
 * and no network. The copy says so, because "we analysed your CV" usually
 * means it was uploaded somewhere.
 *
 * It reports findings, never a score. A match percentage would look like a
 * measurement while really reflecting how much boilerplate the posting
 * contained.
 */

function TermList({ terms, emptyText }: { terms: TermFinding[]; emptyText: string }) {
  if (terms.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {terms.slice(0, 40).map((t) => (
        <Badge key={t.term} variant="secondary" className="font-normal">
          {t.term}
          {t.occurrences > 1 && (
            <span className="ml-1 text-muted-foreground">×{t.occurrences}</span>
          )}
        </Badge>
      ))}
      {terms.length > 40 && (
        <span className="self-center text-xs text-muted-foreground">
          +{terms.length - 40} more
        </span>
      )}
    </div>
  )
}

function BulletList({ findings }: { findings: BulletFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No mechanical weaknesses found in your experience bullets.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {findings.slice(0, 12).map((f, i) => (
        <div key={`${f.entryId}-${i}`}>
          {i > 0 && <Separator className="mb-3" />}
          <p className="text-sm">{f.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {f.title} · {f.company}
            </span>
            {f.issues.map((issue) => (
              <Badge key={issue} variant="outline" className="font-normal">
                {BULLET_ISSUE_LABELS[issue]}
              </Badge>
            ))}
          </div>
        </div>
      ))}
      {findings.length > 12 && (
        <p className="text-xs text-muted-foreground">
          +{findings.length - 12} more not shown.
        </p>
      )}
    </div>
  )
}

export function JobMatchPanel({ profile }: { profile: CandidateProfile | null }) {
  const [jobDescription, setJobDescription] = useState("")
  const [analysis, setAnalysis] = useState<KeywordAnalysis | null>(null)

  const bulletFindings = profile ? analyseProfileBullets(profile) : []
  const bulletSummary = profile ? summariseBullets(profile) : null

  if (!profile) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Analyse against a job posting</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Import a resume or LinkedIn export on the Career Showcase tab first — the analysis
          compares a posting against your saved profile.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4" />
            Analyse against a job posting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="jd">Paste the job description</Label>
            <Textarea
              id="jd"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full posting here…"
              className="min-h-32"
            />
            <p className="text-xs text-muted-foreground">
              Runs entirely in this browser — the posting and your profile are not uploaded
              anywhere, and no AI service is involved.
            </p>
          </div>
          <Button
            onClick={() => setAnalysis(analyseKeywords(jobDescription, profile))}
            disabled={!jobDescription.trim()}
          >
            <Search className="h-3.5 w-3.5" />
            Analyse
          </Button>
        </CardContent>
      </Card>

      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Keyword coverage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Not in your profile ({analysis.absent.length})
              </div>
              <p className="text-xs text-muted-foreground">
                Ranked by how often the posting repeats them — a requirement stated three times
                matters more than one mentioned once. Add the ones you genuinely have; leave real
                gaps alone rather than keyword-stuffing.
              </p>
              <TermList
                terms={analysis.absent}
                emptyText="Nothing the posting asks for is missing from your profile."
              />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Info className="h-3.5 w-3.5" />
                Partial matches ({analysis.partial.length})
              </div>
              <p className="text-xs text-muted-foreground">
                Found only as part of a longer word, or in a different grammatical form. Usually
                fine — worth a glance in case the posting's exact wording is the one an ATS
                filters on.
              </p>
              <TermList terms={analysis.partial} emptyText="No partial matches." />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Already covered ({analysis.matched.length})
              </div>
              <TermList terms={analysis.matched} emptyText="No direct matches." />
            </div>

            <p className="text-xs text-muted-foreground">
              {analysis.consideredTerms} distinct terms considered. Deliberately no overall match
              score: this compares words, not meaning, so a percentage would look more precise
              than it is.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" />
            Experience bullets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bulletSummary && bulletSummary.total > 0 && (
            <p className="text-xs text-muted-foreground">
              {bulletSummary.quantified} of {bulletSummary.total} bullets include a number.
              Flagging mechanical weaknesses only — this doesn't judge whether the writing is
              good, and rewriting would need an AI service, which jobtrack deliberately doesn't
              use.
            </p>
          )}
          <BulletList findings={bulletFindings} />
        </CardContent>
      </Card>
    </div>
  )
}
