// POST /api/webhook — Gallabox → this endpoint
// Optional envs:
//   WEBHOOK_SHARED_SECRET — if set, requests must send x-shared-secret header matching
//   KV_REST_API_URL + KV_REST_API_TOKEN — if present, events are queued in Vercel KV

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const secret = process.env.WEBHOOK_SHARED_SECRET;
  if (secret && req.headers['x-shared-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const record = {
    receivedAt: new Date().toISOString(),
    headers: {
      'user-agent': req.headers['user-agent'] || null,
      'x-gallabox-event': req.headers['x-gallabox-event'] || null,
      'content-type': req.headers['content-type'] || null,
    },
    body: req.body,
  };

  console.log('[gallabox]', JSON.stringify(record));

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import('@vercel/kv');
      await kv.lpush('gallabox:events', JSON.stringify(record));
      await kv.ltrim('gallabox:events', 0, 499);
    } catch (err) {
      console.warn('[gallabox] kv push failed:', err.message);
    }
  }

  return res.status(200).json({ received: true, at: record.receivedAt });
}
