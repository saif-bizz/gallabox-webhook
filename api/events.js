import { getRedis } from './_redis.js';

// GET /api/events?limit=50&secret=XXX — pull recent events from Upstash Redis.
// Protected by WEBHOOK_SHARED_SECRET if set. Only works when Redis is configured.

export default async function handler(req, res) {
  const secret = process.env.WEBHOOK_SHARED_SECRET;
  if (secret && req.query.secret !== secret && req.headers['x-shared-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const redis = getRedis();
  if (!redis) {
    return res.status(503).json({ error: 'redis not configured' });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);

  try {
    const raw = await redis.lrange('gallabox:events', 0, limit - 1);
    const events = raw.map((r) => {
      if (typeof r === 'object') return r;
      try { return JSON.parse(r); } catch { return { parseError: true, raw: r }; }
    });
    return res.status(200).json({ count: events.length, events });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
