# Self-hosting the sync server

You do not need this. jobtrack works completely in your browser with no
account and no backend — that is the default and it is not a degraded mode.
Set this up only if you want the same job search on more than one device.

What you get: your applications and profile on a server you own, merged
across devices. What you do not get, by design: any of your documents. The
server stores filenames, never file contents.

---

## What you need

- A machine that runs Docker and stays on (a NAS, a small VPS, a spare box).
- A domain you control, if you want to reach it from outside your network.

The reference setup below is a Synology DS918+ behind a Cloudflare Tunnel,
which is how the author runs it. Nothing here is Synology-specific — any
Docker host works, and if you only ever sync inside your own LAN you can
skip Cloudflare entirely.

---

## 1. Generate secrets

Two different values. Do not reuse one for both.

```bash
openssl rand -base64 32   # JOBTRACK_SYNC_TOKEN
openssl rand -base64 32   # JOBTRACK_SESSION_SECRET
```

`JOBTRACK_SYNC_TOKEN` is the only thing standing between your job search and
anyone who finds the URL. The server refuses to start if it is missing or
shorter than 24 characters.

## 2. Configure

```bash
cd server
cp .env.example .env
```

Fill in `.env`:

| Variable | What it is |
| --- | --- |
| `JOBTRACK_SYNC_TOKEN` | The secret above. You paste this into the app. |
| `JOBTRACK_SESSION_SECRET` | The second secret. Signs cookies. |
| `JOBTRACK_APP_ORIGIN` | Exact origin serving the app, e.g. `https://jobs.example.com`. No trailing slash. |

`JOBTRACK_APP_ORIGIN` has to be exact. It is both the CORS allowlist and the
only URL the server will redirect to after login — that is deliberate, so a
crafted link cannot bounce you somewhere else.

## 3. Run it

```bash
docker compose up -d
docker compose logs -f jobtrack-sync
```

You should see it report its port, database path, and whether LinkedIn
sign-in is enabled. Check it:

```bash
curl http://localhost:8787/api/health
# {"ok":true,"service":"jobtrack-sync","linkedin":false}
```

Note that `docker-compose.yml` publishes **no ports**. Traffic arrives
through the tunnel in step 4, so the NAS needs no port forwarding and no
inbound firewall rule. If you would rather expose it directly on your LAN,
add `ports: ["8787:8787"]` — but then the token really is the only thing
protecting it.

## 4. Expose it (Cloudflare Tunnel)

Skip this if you only sync on your own network.

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → **Create a
   tunnel**, pick *Cloudflared*.
2. Copy the tunnel token. Put it in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
3. Add a public hostname: `sync.example.com` → `http://jobtrack-sync:8787`.
   That hostname is the container name on the compose network, not
   `localhost`.
4. `docker compose up -d` again.

### About Cloudflare Access

If you put Cloudflare Access in front of `sync.example.com`, note that the
browser talks to this server with `fetch`, not by navigating to it. An
Access login page cannot be completed inside a `fetch`, so a protected sync
endpoint returns the login HTML and sync fails with a confusing parse error.

Either leave the sync hostname open (the bearer token is doing the real
work), or add an Access **service token** and send it — the app does not
currently do that. Gate the *app* hostname if you want a login wall; the
sync API is a machine endpoint.

## 5. Connect the app

In jobtrack: **Sync** (top right) → paste the server URL and the token →
**Connect** → **Sync now**.

Repeat on every device with the same values. First sync from a new device
uploads whatever that device has and pulls down everything else — it does
not wipe either side.

---

## How sync behaves

Last-write-wins per record, compared on `updatedAt`. There is no conflict
prompt: for one person on two or three devices, edits almost never collide
to the second, and asking you to resolve merges would cost more attention
than it saves.

Two behaviours worth knowing, both deliberate:

- **A device with nothing on it will not erase the server.** An empty
  payload means "I have nothing", not "delete everything".
- **Deletes stick.** Deleting an application records a tombstone, so the
  delete wins against other devices that still hold a copy. Without that, a
  deleted application would come back on the next sync. Tombstones are kept
  indefinitely; they are an id and a timestamp.

An edit made *strictly after* a delete elsewhere resurrects the record — you
touched it more recently than you deleted it. Exact ties resolve to the
delete.

## Backups

Everything lives in one SQLite file in the `jobtrack-data` volume.

```bash
docker compose exec jobtrack-sync \
  node -e "new (require('node:sqlite').DatabaseSync)(process.env.JOBTRACK_DB_PATH).exec(\"VACUUM INTO '/data/backup.sqlite'\")"
docker compose cp jobtrack-sync:/data/backup.sqlite ./jobtrack-backup.sqlite
```

`VACUUM INTO` takes a consistent snapshot of a live database — copying the
`.sqlite` file directly while the server is running can capture a torn write
alongside a stale WAL.

Keep backups off the repo. `*.sqlite` is gitignored and `npm run guard`
fails CI if that protection is removed, because that file contains every
application, note, and profile the server has seen.

---

## Optional: Sign in with LinkedIn

This is **identity only** — name, email, photo. It cannot import your work
history, because LinkedIn does not expose work history to third-party apps
at all (that access became partner-only in 2023). To bring in your career,
use *Import from LinkedIn* on the Career Showcase tab, which reads the data
export you download from your own account.

It is genuinely optional. Leave the variables blank and the app hides the
button.

1. <https://www.linkedin.com/developers/apps> → **Create app**. LinkedIn
   requires an associated Company Page; you can create one for yourself.
2. **Products** → request *Sign In with LinkedIn using OpenID Connect*.
   Usually granted immediately.
3. **Auth** → copy the Client ID and Client Secret into `.env`.
4. **Auth** → *Authorized redirect URLs* → add exactly what you set as
   `LINKEDIN_REDIRECT_URI`, e.g.
   `https://sync.example.com/auth/linkedin/callback`. A trailing-slash
   difference is enough for LinkedIn to reject the login.
5. `docker compose up -d`. The boot log should now say
   `LinkedIn sign-in: enabled`.

All three variables must be set together. Set one or two and sign-in stays
off — and says so in the log, rather than presenting a button that fails.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Refuses to start, complains about a variable | A required value is missing or the token is under 24 characters. The message names the fix. |
| `Rejected by the server: check the sync token` | The token in the app does not match `JOBTRACK_SYNC_TOKEN`. |
| Browser console shows a CORS error | `JOBTRACK_APP_ORIGIN` does not exactly match the origin serving the app — check scheme and trailing slash. |
| Sync fails with a JSON parse error | Usually Cloudflare Access on the sync hostname returning a login page to `fetch`. See step 4. |
| Data vanished after recreating the container | No volume mounted, so the database lived in the container's writable layer. Check `docker compose config`. |
| LinkedIn login returns `Invalid OAuth state` | Cookie was dropped — the state cookie is `Secure`, so the flow needs HTTPS end to end. |
