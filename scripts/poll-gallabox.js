#!/usr/bin/env node
// Poll Gallabox for inbound customer messages since our last check, and forward
// each one to our Vercel webhook endpoint. Replaces Gallabox's native webhook
// (which requires a paid plan upgrade).
//
// Env required:
//   GALLABOX_API_KEY, GALLABOX_API_SECRET
//   GALLABOX_ACCOUNT_ID, GALLABOX_CHANNEL_ID
//   WEBHOOK_URL                         e.g. https://gallabox-webhook.vercel.app/api/webhook
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// Optional:
//   WEBHOOK_SHARED_SECRET               forwarded as x-shared-secret header
//   LOOKBACK_MINUTES                    on first run / fallback (default 15)

import { Redis } from '@upstash/redis';

const GB = 'https://server.gallabox.com';
const LAST_SEEN_KEY = `gallabox:lastSeen:${process.env.GALLABOX_CHANNEL_ID}`;

function env(name, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error(`missing env ${name}`);
  return v;
}

async function gallaboxGet(path) {
  const res = await fetch(`${GB}${path}`, {
    headers: {
      apiKey: env('GALLABOX_API_KEY'),
      apiSecret: env('GALLABOX_API_SECRET'),
    },
  });
  if (!res.ok) throw new Error(`gallabox GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function forward(message, contact, conversation) {
  const body = {
    source: 'gallabox-poller',
    event: 'message.inbound',
    brand: 'agc',
    messageId: message.id,
    conversationId: message.conversationId,
    contactId: message.contactId,
    contactName: contact?.name || null,
    from: message.whatsapp?.from || null,
    text: message.whatsapp?.text?.body || null,
    type: message.whatsapp?.type || null,
    createdAt: message.createdAt,
    raw: { message, conversation },
  };

  const res = await fetch(env('WEBHOOK_URL'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.WEBHOOK_SHARED_SECRET
        ? { 'x-shared-secret': process.env.WEBHOOK_SHARED_SECRET }
        : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`forward failed for ${message.id}: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

async function main() {
  const redis = new Redis({
    url: env('UPSTASH_REDIS_REST_URL'),
    token: env('UPSTASH_REDIS_REST_TOKEN'),
  });

  const accountId = env('GALLABOX_ACCOUNT_ID');
  const channelId = env('GALLABOX_CHANNEL_ID');
  const lookbackMin = parseInt(process.env.LOOKBACK_MINUTES, 10) || 15;

  const lastSeenRaw = await redis.get(LAST_SEEN_KEY);
  const lastSeen = lastSeenRaw
    ? new Date(lastSeenRaw)
    : new Date(Date.now() - lookbackMin * 60 * 1000);

  const runAt = new Date();
  console.log(`[poller] runAt=${runAt.toISOString()} lastSeen=${lastSeen.toISOString()}`);

  const convs = await gallaboxGet(
    `/devapi/accounts/${accountId}/conversations?channelId=${channelId}&limit=50`
  );

  const active = convs.filter((c) => new Date(c.updatedAt) > lastSeen);
  console.log(`[poller] conversations total=${convs.length} active_since_lastSeen=${active.length}`);

  let forwarded = 0;
  let newest = lastSeen;

  for (const conv of active) {
    const msgs = await gallaboxGet(
      `/devapi/accounts/${accountId}/messages?channelId=${channelId}&contactId=${conv.contactId}&limit=20`
    );

    // inbound from customer = sender === contactId AND status "received" AND after lastSeen
    const inboundNew = msgs.filter(
      (m) =>
        m.sender === conv.contactId &&
        m.whatsapp?.status === 'received' &&
        new Date(m.createdAt) > lastSeen
    );

    for (const m of inboundNew) {
      const ok = await forward(m, conv.contact, {
        id: conv.id,
        assigneeId: conv.assigneeId,
        assigneeName: conv.user?.name || null,
        status: conv.status,
      });
      if (ok) {
        forwarded++;
        const mTime = new Date(m.createdAt);
        if (mTime > newest) newest = mTime;
      }
    }
  }

  // Advance the watermark even if nothing forwarded, so we don't keep rescanning.
  // Use runAt to avoid missing a message if the poller is slow.
  const newMark = forwarded > 0 ? newest : runAt;
  await redis.set(LAST_SEEN_KEY, newMark.toISOString());

  console.log(
    `[poller] done forwarded=${forwarded} new_lastSeen=${newMark.toISOString()}`
  );
}

main().catch((err) => {
  console.error('[poller] fatal:', err);
  process.exit(1);
});
