# gallabox-webhook

Receives inbound Gallabox (WhatsApp Business) events and queues them for the Claude-powered Digital Sales Closer to process. Deployed on Vercel, backed by Upstash Redis.

Because Gallabox's native webhook feature is gated behind a paid plan, a GitHub Actions cron polls Gallabox every 5 minutes and forwards new inbound messages to the same endpoint — so downstream consumers only ever deal with one ingress shape.

## Endpoints

- `POST /api/webhook` — ingest an event (either a real Gallabox webhook or a poller-forwarded message). Optional `x-shared-secret` header auth.
- `GET  /api/health` — liveness probe. Reports whether Redis and the shared secret are configured.
- `GET  /api/events?limit=50&secret=…` — read the last N events from the queue (requires Redis + shared secret).

## Vercel setup

1. Import the repo in Vercel → Deploy (no framework, no build step).
2. Storage tab → add **Upstash Redis** → connect to the project. This injects `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
3. Settings → Environment Variables → add `WEBHOOK_SHARED_SECRET` (random string). Redeploy.

## GitHub Actions poller setup

The workflow at `.github/workflows/poll-gallabox.yml` runs `scripts/poll-gallabox.js` every 5 minutes.

Add the following **Repository secrets** in GitHub → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `GALLABOX_API_KEY` | from Gallabox dashboard (Developer → API Keys) |
| `GALLABOX_API_SECRET` | paired secret |
| `GALLABOX_ACCOUNT_ID` | Gallabox account ID |
| `GALLABOX_CHANNEL_ID` | WhatsApp channel ID |
| `WEBHOOK_URL` | `https://gallabox-webhook.vercel.app/api/webhook` |
| `WEBHOOK_SHARED_SECRET` | same value as the Vercel env var (if set) |
| `UPSTASH_REDIS_REST_URL` | copy from Vercel Storage → Upstash tab |
| `UPSTASH_REDIS_REST_TOKEN` | same source |

After adding the secrets, go to the Actions tab → **Poll Gallabox** → **Run workflow** to trigger the first run manually. Subsequent runs fire on the 5-min schedule.

## Architecture

```
                          ┌──────────────────────────┐
                          │  Gallabox (AGC channel)  │
                          └──────────┬───────────────┘
                                     │ REST API
                                     ▼
          ┌──────────────────────────────────────────────────┐
          │  GitHub Actions cron (every 5 min)               │
          │    scripts/poll-gallabox.js                       │
          │    – diffs conversations.updatedAt vs lastSeen    │
          │    – filters inbound messages (sender=contactId)  │
          │    – POSTs each to /api/webhook                   │
          └──────────────────────────┬───────────────────────┘
                                     ▼
          ┌──────────────────────────────────────────────────┐
          │  Vercel: /api/webhook (this repo)                 │
          │    – validates x-shared-secret                    │
          │    – lpush to Upstash list `gallabox:events`      │
          └──────────────────────────┬───────────────────────┘
                                     ▼
          ┌──────────────────────────────────────────────────┐
          │  Claude Code Digital Sales Closer (operator)      │
          │    – GET /api/events during 10pm-8am GST          │
          │    – drafts replies, pushes for approval          │
          │    – sends approved replies via Gallabox REST     │
          └──────────────────────────────────────────────────┘
```

## Local testing

```bash
curl https://gallabox-webhook.vercel.app/api/health
curl -X POST https://gallabox-webhook.vercel.app/api/webhook \
  -H "content-type: application/json" \
  -H "x-shared-secret: $WEBHOOK_SHARED_SECRET" \
  -d '{"test": true}'
curl "https://gallabox-webhook.vercel.app/api/events?secret=$WEBHOOK_SHARED_SECRET&limit=5"
```

## Notes

- Repo is public to bypass Vercel Hobby's committer-association check on auto-deploys. Code contains no secrets — all credentials live as Vercel env vars and GitHub Actions secrets.
- The poller uses a single `gallabox:lastSeen:<channelId>` key in Upstash to track the watermark across runs. Safe to retrigger manually; won't re-forward already-seen messages.
