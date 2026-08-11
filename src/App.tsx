import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/sonner"
import { Pipeline } from "@/pages/Pipeline"
import { CareerShowcase } from "@/pages/CareerShowcase"
import { ComingSoon } from "@/pages/ComingSoon"

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-xl font-bold tracking-tight">jobtrack</h1>
          <p className="text-sm text-muted-foreground">
            Local-first job application tracker. Your data stays in this browser.
          </p>
        </header>

        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="cv">CV &amp; Cover Letters</TabsTrigger>
            <TabsTrigger value="career">Career Showcase</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline">
            <Pipeline />
          </TabsContent>
          <TabsContent value="cv">
            <ComingSoon
              title="CV & Cover Letter Prep"
              description="A metadata view of your submitted materials and ATS keyword coverage per application — filenames only, documents themselves never leave your machine."
            />
          </TabsContent>
          <TabsContent value="career">
            <CareerShowcase />
          </TabsContent>
        </Tabs>
      </div>

      <Toaster />
    </QueryClientProvider>
  )
}
