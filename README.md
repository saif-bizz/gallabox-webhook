# gallabox-webhook

Webhook receiver for Gallabox (WhatsApp Business API) events. Deployed on Vercel. Feeds the Digital Sales Closer agent so after-hours inbound enquiries can be processed by Claude.

## Endpoints

- `POST /api/webhook` — Gallabox POSTs events here. Optional `x-shared-secret` header auth.
- `GET  /api/health` — liveness check.
- `GET  /api/events?limit=50&secret=…` — read recent events from the KV queue (requires KV + secret).

## Deploy

1. Push this repo to GitHub.
2. In Vercel → **Import Project** → pick this repo → Deploy (no framework, no build step needed).
3. (Recommended) Add **Vercel KV** via Integrations/Storage tab — env vars `KV_REST_API_URL` and `KV_REST_API_TOKEN` auto-provision.
4. (Recommended) Set env var `WEBHOOK_SHARED_SECRET` to a random string (used to authenticate both Gallabox → webhook and our pollers reading `/api/events`).

## Wire up Gallabox

In Gallabox dashboard → Webhooks → add:
- URL: `https://<your-vercel-project>.vercel.app/api/webhook`
- Custom header: `x-shared-secret: <your secret>` (if Gallabox supports custom headers; otherwise leave secret unset initially)
- Events: incoming message, message status (whichever the dashboard exposes)

## Verify

```bash
curl https://<project>.vercel.app/api/health
# → { "status": "ok", ... }

curl -X POST https://<project>.vercel.app/api/webhook \
  -H "content-type: application/json" \
  -H "x-shared-secret: <secret>" \
  -d '{"test": true}'
# → { "received": true, "at": "..." }
```

Then check Vercel → Deployments → Logs to see the incoming event, or hit `/api/events?secret=…` if KV is wired.

## Architecture (next step)

Vercel webhook → Vercel KV queue → Claude Code poller (scheduled agent on operator's machine) → Digital Sales Closer drafts reply → push notification to operator phone for approval → approved draft sends via Gallabox send-message API.
