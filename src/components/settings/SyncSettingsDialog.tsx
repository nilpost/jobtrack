import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CloudOff, Cloud, Loader2, Linkedin, LogOut, KeyRound } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  checkHealth,
  clearSyncConfig,
  fetchIdentity,
  googleSignInUrl,
  linkedInSignInUrl,
  linkedInSignOut,
  loadSyncConfig,
  saveSyncConfig,
  syncNow,
  type LinkedInIdentity,
} from "@/lib/syncClient"

/**
 * Optional sync + optional LinkedIn identity. Both are off by default and
 * the app is fully usable with this dialog never opened — that is the
 * local-first promise, not a limitation to apologise for, so the copy says
 * so plainly rather than nudging the user to connect something.
 */
export function SyncSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const existing = loadSyncConfig()
  const [endpoint, setEndpoint] = useState(existing?.endpoint ?? "")
  const [token, setToken] = useState(existing?.token ?? "")
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(!!existing)
  const [identity, setIdentity] = useState<LinkedInIdentity | null>(null)
  const [linkedInConfigured, setLinkedInConfigured] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState(false)
  const [googleCanSync, setGoogleCanSync] = useState(false)

  function refreshIdentity(endpointToUse: string) {
    // Identity lives in an httpOnly cookie on the sync server, so the only
    // way to know who is signed in is to ask it.
    return fetchIdentity(endpointToUse)
      .then((r) => {
        setIdentity(r.identity)
        setLinkedInConfigured(r.configured)
        setGoogleConfigured(!!r.google?.configured)
        setGoogleCanSync(!!r.google?.canSync)
      })
      .catch(() => {
        setIdentity(null)
        setLinkedInConfigured(false)
        setGoogleConfigured(false)
        setGoogleCanSync(false)
      })
  }

  useEffect(() => {
    if (!open) return
    const config = loadSyncConfig()
    setConnected(!!config)
    if (!config) {
      setIdentity(null)
      setLinkedInConfigured(false)
      setGoogleConfigured(false)
      setGoogleCanSync(false)
      return
    }
    void refreshIdentity(config.endpoint)
  }, [open])

  // The Google callback returns to the app with a result in the query string.
  // Reporting it is what distinguishes "signed in and syncing" from the two
  // silent failures: declined, and signed in with an address the server does
  // not allow.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("google")
    if (!result) return
    if (result === "ok") toast.success("Signed in with Google — sync is authorised.")
    else if (result === "not_allowed") {
      toast.error("That Google account is not allowed to sync", {
        description: "Add its address to GOOGLE_ALLOWED_EMAILS on the server, then sign in again.",
      })
    } else if (result === "denied") toast.info("Google sign-in was cancelled.")
    else toast.error("Google sign-in failed.")
    // Strip the parameter so a refresh does not replay the toast.
    const url = new URL(window.location.href)
    url.searchParams.delete("google")
    window.history.replaceState({}, "", url.toString())
  }, [])

  /** Endpoint is required; the token is not — connecting with the endpoint
   *  alone is the Google path, where the credential is a cookie the server
   *  sets rather than a value stored here. */
  async function handleConnect() {
    if (!endpoint.trim()) return
    setBusy(true)
    try {
      // Reachability is checked before the config is saved, so a typo
      // surfaces here rather than as a silent failure later.
      const health = await checkHealth(endpoint.trim())
      if (!health.ok) throw new Error("Server did not report healthy")
      saveSyncConfig({ endpoint: endpoint.trim(), token: token.trim() || undefined })
      setConnected(true)
      setLinkedInConfigured(health.linkedin)
      setGoogleConfigured(health.google)
      await refreshIdentity(endpoint.trim())
      toast.success("Connected", {
        description: token.trim()
          ? "Run a sync to exchange data."
          : "Now sign in with Google to authorise sync.",
      })
    } catch (err) {
      toast.error("Couldn't reach that server", {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleSync() {
    const config = loadSyncConfig()
    if (!config) return
    setBusy(true)
    try {
      const result = await syncNow(config)
      toast.success("Synced", {
        description: `${result.applications} application${result.applications === 1 ? "" : "s"}${
          result.hasProfile ? ", profile included" : ""
        }.`,
      })
    } catch (err) {
      toast.error("Sync failed", {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBusy(false)
    }
  }

  function handleDisconnect() {
    clearSyncConfig()
    setConnected(false)
    setIdentity(null)
    setToken("")
    // Deliberately does NOT delete local data — disconnecting is "stop
    // talking to that server", not "erase my job search".
    toast.success("Disconnected", { description: "Your data stays in this browser." })
  }

  async function handleSignOut() {
    const config = loadSyncConfig()
    if (!config) return
    await linkedInSignOut(config.endpoint)
    setIdentity(null)
    toast.success("Signed out of LinkedIn")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync &amp; account</DialogTitle>
          <DialogDescription>
            Both optional. jobtrack works fully offline in this browser — connect a server only
            if you want the same data on more than one device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {connected ? (
              <Badge variant="secondary" className="gap-1">
                <Cloud className="h-3 w-3" />
                Sync connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <CloudOff className="h-3 w-3" />
                Local only
              </Badge>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sync-endpoint">Server URL</Label>
            <Input
              id="sync-endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://sync.example.com"
              disabled={connected}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sync-token">
              Sync token <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="sync-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste JOBTRACK_SYNC_TOKEN"
              disabled={connected}
            />
            <p className="text-xs text-muted-foreground">
              The same value as <code className="text-xs">JOBTRACK_SYNC_TOKEN</code> on your
              server. Stored in this browser only — it is never included in an export or sent to
              another device.
            </p>
            <p className="text-xs text-muted-foreground">
              Leave it blank to sign in with Google instead, if your server has that configured.
              Either one authorises sync; you don't need both.
            </p>
          </div>

          {connected && googleConfigured && (
            <div className="space-y-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  Google sign-in
                </Label>
                {googleCanSync ? (
                  <Badge variant="secondary">Authorised</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const config = loadSyncConfig()
                      if (config) window.location.href = googleSignInUrl(config.endpoint)
                    }}
                  >
                    Sign in with Google
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {googleCanSync
                  ? "This browser is signed in with an account your server allows, so sync works without a token."
                  : "Signing in authorises sync for this browser — but only for addresses listed in GOOGLE_ALLOWED_EMAILS on your server. Any other account is refused."}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            {!connected ? (
              <Button onClick={handleConnect} disabled={busy || !endpoint.trim()}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Connect
              </Button>
            ) : (
              <>
                <Button onClick={handleSync} disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5" />
                  )}
                  Sync now
                </Button>
                <Button variant="outline" onClick={handleDisconnect} disabled={busy}>
                  Disconnect
                </Button>
              </>
            )}
          </div>

          {connected && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>LinkedIn account</Label>
                {!linkedInConfigured && (
                  <p className="text-xs text-muted-foreground">
                    Not enabled on your server. Set the LinkedIn variables in the server's{" "}
                    <code className="text-xs">.env</code> to turn it on.
                  </p>
                )}
                {linkedInConfigured && identity && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      <div className="truncate font-medium">{identity.name ?? "Signed in"}</div>
                      {identity.email && (
                        <div className="truncate text-xs text-muted-foreground">
                          {identity.email}
                        </div>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={handleSignOut}>
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </Button>
                  </div>
                )}
                {linkedInConfigured && !identity && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const config = loadSyncConfig()
                      if (config) window.location.href = linkedInSignInUrl(config.endpoint)
                    }}
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    Sign in with LinkedIn
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Signing in confirms who you are — name, email, and photo. It does{" "}
                  <strong>not</strong> import your work history: LinkedIn does not expose that to
                  third-party apps at all. To bring in your career, use{" "}
                  <em>Import from LinkedIn</em> on the Career Showcase tab, which reads the data
                  export you download from LinkedIn yourself.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
