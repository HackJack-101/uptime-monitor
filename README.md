# Uptime Monitor

Self-hosted monitoring for all your web services, organised by **project**, with **user management**, **per-project access control**, **encrypted secrets** and **alerts** on Discord, email, Telegram, Signal, Slack, ntfy, Gotify or any webhook.

It ships as a single Docker image, ready for Portainer.

---

## Features

| | |
|---|---|
| **Checks** | HTTP(S) (status codes, keyword, Basic / Bearer / API-key header auth), TCP port, ICMP ping, SSH (auth + optional command), DNS records, TLS certificate expiry |
| **Projects** | Every monitor belongs to exactly one project. Projects hold their own monitors, channels, rules and members |
| **Users** | One **superadmin**, **admins** (all projects) and **users** assigned to one or more projects as *viewer* or *editor* |
| **Check rules** | Interval, timeout, retries, retry interval and degraded threshold. Set them per project (defaults) or override them per monitor |
| **Notification rules** | Events (down / recovered / degraded / certificate expiring) → channels, with a failure threshold and reminders. Scope a rule to a project or to a single monitor |
| **Security** | Secrets encrypted with AES-256-GCM, write-only API, scrypt password hashing, HTTP-only SameSite cookies, CSRF protection, rate-limited login, audit log, strict CSP |
| **OVH DNS** | Connect an OVHcloud account per project and see which subdomains of one DNS zone are running, in error or not monitored |
| **UI** | Responsive (mobile / tablet / desktop), light & dark themes, live dashboard, response-time charts, incident history, built-in guide |

---

## Quick start with Portainer

1. In Portainer, go to **Stacks → Add stack** and paste the content of [`docker-compose.yml`](docker-compose.yml).
2. The stack uses the image published by CI: `ghcr.io/hackjack-101/uptime-monitor:latest`.
3. Under **Environment variables**, set at least:
   - `APP_SECRET`: a long random string (`openssl rand -base64 48`). **Keep it safe**: it encrypts every stored secret.
   - `PUBLIC_URL`: the URL you will use to reach the UI (used for links in alerts).
4. Deploy the stack and open `http://<host>:3000`.
5. On first start, open the container logs and copy the **one-time setup token**:

   ```
   No account exists yet. Open the web UI and use this one-time setup token: xxxxxxxx
   ```

   Paste it into the setup screen to create the **superadmin** account.
   Alternatively, set `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` to create it automatically, then remove them.

> If the GHCR package is private, add `ghcr.io` as a registry in Portainer (**Registries → Add registry**) with a GitHub personal access token that has the `read:packages` scope, or make the package public.

### Plain Docker

```bash
docker run -d --name uptime-monitor --restart unless-stopped \
  -p 3000:3000 -v uptime-data:/data \
  -e APP_SECRET="$(openssl rand -base64 48)" \
  ghcr.io/hackjack-101/uptime-monitor:latest
```

### Behind a reverse proxy

Serve the app over **HTTPS** in production (Traefik, Caddy, Nginx Proxy Manager…) and set `TRUST_PROXY=true`, so that client IPs (rate limiting, audit log) and the `Secure` cookie flag are detected correctly. Configure HSTS on the proxy.

---

## Configuration

All settings are environment variables.

| Variable | Default | Description |
|---|---|---|
| `APP_SECRET` | *(generated)* | Master key (≥ 32 chars) used to encrypt secrets. If unset, a key is generated in `/data/secret.key`. Back it up either way |
| `PUBLIC_URL` | | Base URL used in notification links, e.g. `https://status.example.com` |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `/data` | SQLite database and generated key location |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` headers from a reverse proxy |
| `SESSION_TTL_HOURS` | `168` | Session lifetime |
| `RETENTION_DAYS` | `30` | How long check results and notification logs are kept |
| `MAX_CONCURRENT_CHECKS` | `20` | Maximum checks running at the same time |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` / `SUPERADMIN_NAME` | | Create the superadmin on first start (ignored once a user exists) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | | SMTP server for email notifications |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

### Backups

Everything lives in the `/data` volume (`monitor.db` + `secret.key` if generated). Back up the volume **and** your `APP_SECRET`. Without the key, stored secrets cannot be decrypted.

---

## Concepts at a glance

```
Project ──┬── Monitors ──── Monitor rules (optional)
          ├── Channels   (Discord, email, …)
          ├── Project rules (apply to all monitors that inherit them)
          └── Members    (users: viewer / editor)
```

- **Check rule inheritance**: monitor override → project default → global default (60s interval, 10s timeout, 0 retries, 30s retry interval, degraded threshold off).
- **Notification scope**: a monitor receives its own rules plus the project rules, unless *Use project notification rules* is turned off.
- **Roles**:

  | Role | Access |
  |---|---|
  | Superadmin | Everything, manages admins. Exactly one, cannot be deleted |
  | Admin | All projects, manages projects, users and memberships |
  | User (editor) | Assigned projects: manage monitors, channels, rules |
  | User (viewer) | Assigned projects: read-only |

The full user documentation is built into the web UI under **Guide**.

### OVH DNS zone view

An admin can connect an **OVHcloud account** to a project (*Project → Settings → OVH DNS zone*) and pick **one domain**. The project then gets a dedicated **DNS zone** page that lists every A / AAAA / CNAME host of that zone and matches it with the project's monitors by hostname:

- **Running**: monitored and up, according to the check rules of the linked monitors.
- **In error**: at least one linked monitor is down.
- **Not monitored**: the record exists but nothing checks it (one click creates an HTTPS monitor).
- **Missing DNS record**: a monitor targets a host of the zone that has no record.

Create **read-only** credentials on the OVH token page (`https://eu.api.ovh.com/createToken/?GET=/domain/zone&GET=/domain/zone/*`, or the `ca` / `us` equivalent). The application secret and consumer key are encrypted at rest and write-only. Zone records are cached for 15 minutes.

### Notification channels

| Channel | Free | Notes |
|---|---|---|
| Email | ✅ | Requires SMTP env vars |
| Discord | ✅ | Channel webhook |
| Slack | ✅ | Incoming webhook |
| Telegram | ✅ | Bot token + chat ID |
| Signal | ✅ | Through a self-hosted [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) |
| ntfy | ✅ | ntfy.sh or self-hosted |
| Gotify | ✅ | Self-hosted |
| Webhook | ✅ | JSON POST to any URL |
| WhatsApp | ❌ | Not implemented: no free official API |

---

## Security model

- **Secrets** (HTTP passwords / tokens / API keys, SSH passwords and private keys, webhook URLs, bot tokens, OVH application secrets and consumer keys) are encrypted with AES-256-GCM using a key derived from `APP_SECRET`. The API **never returns them**: clients only see whether a secret is set. Secret values are masked if they ever appear in a check error message.
- **Credentials are not forwarded** to another origin when an HTTP check follows a redirect.
- **SSH host key pinning** is available (SHA256 fingerprint) to prevent man-in-the-middle attacks.
- **Passwords** are hashed with scrypt. **Sessions** are random tokens stored hashed, sent as `HttpOnly; SameSite=Strict` cookies (`Secure` over HTTPS), and revoked when a password, role or account status changes.
- **CSRF**: state-changing requests require a custom header in addition to SameSite cookies.
- **Brute force**: sign-in and setup endpoints are rate-limited. Unknown accounts take as long to reject as wrong passwords.
- **Least privilege**: a single superadmin (enforced by a database constraint). Projects a user cannot access return `404`.
- **Audit log** of sign-ins, user, project, monitor, channel and rule changes.
- The container runs as an unprivileged user, with a strict Content-Security-Policy.

> Monitoring means making outbound requests to targets that users define. Only give *editor* access to people you trust with network access from the container's location.

---

## Development

Requirements: **Node.js 24+**.

```bash
npm install
npm run dev            # API on :3000 + Vite dev server on :5173 (proxied)
npm test               # server unit & integration tests (Vitest)
npm run typecheck
npm run build          # builds web/dist and server/dist
```

Then open http://localhost:5173. On first run, the setup token is printed in the terminal.

### Project layout

```
server/                 Fastify API (TypeScript)
  src/checkers/         HTTP, TCP, ping, SSH, DNS, TLS probes
  src/notifications/    channel senders + rule engine
  src/ovh/              OVHcloud API client + DNS zone / monitor matching
  src/registry/         monitor & channel type definitions (drive validation and UI forms)
  src/routes/           REST endpoints
  src/scheduler.ts      check loop, retries, incidents, retention
  test/                 Vitest suites
web/                    React + Vite + Tailwind single-page app
  src/pages/            screens (dashboard, projects, monitors, users, guide…)
  src/components/       UI kit, dynamic forms, charts
Dockerfile              multi-stage image (amd64 + arm64)
.github/workflows/      CI: typecheck, test, build, publish to GHCR
```

### Adding a monitor type or channel

1. Declare its fields in `server/src/registry/monitors.ts` or `channels.ts` (mark secrets with `kind: 'secret'`).
2. Implement the checker in `server/src/checkers/` (or the sender in `notifications/senders.ts`) and register it.

The UI form, validation and secret encryption follow automatically.

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request to `master`:

1. Install, typecheck, run the tests, build.
2. Build a multi-arch Docker image (`linux/amd64`, `linux/arm64`).
3. On `master`, push `ghcr.io/hackjack-101/uptime-monitor:latest` and `:sha-<commit>`. On `vX.Y.Z` tags, also push `:X.Y.Z` and `:X.Y`.

To redeploy in Portainer, use **Pull and redeploy** on the stack, or enable a stack webhook.

## Commit convention

This repository follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Scopes: `server`, `web`, `docker`, `deps`… Use a `!` or a `BREAKING CHANGE:` footer for breaking changes. Commit directly on `master`.
