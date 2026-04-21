import { getRedis } from './_redis.js';

// POST /api/webhook — Gallabox → this endpoint
// Optional envs:
//   WEBHOOK_SHARED_SECRET — if set, requests must send x-shared-secret header matching
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN — if present, events are queued

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

  const redis = getRedis();
  if (redis) {
    try {
      await redis.lpush('gallabox:events', JSON.stringify(record));
      await redis.ltrim('gallabox:events', 0, 499);
    } catch (err) {
      console.warn('[gallabox] redis push failed:', err.message);
    }
  }

  return res.status(200).json({ received: true, at: record.receivedAt });
}
