import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Not built yet — see the project roadmap for what's planned here.
      </CardContent>
    </Card>
  )
}
