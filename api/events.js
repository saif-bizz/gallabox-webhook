// GET /api/events?limit=50&secret=XXX — pull recent events from Vercel KV
// Protected by WEBHOOK_SHARED_SECRET if set. Only works when KV is configured.

export default async function handler(req, res) {
  const secret = process.env.WEBHOOK_SHARED_SECRET;
  if (secret && req.query.secret !== secret && req.headers['x-shared-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'kv not configured' });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);

  try {
    const { kv } = await import('@vercel/kv');
    const raw = await kv.lrange('gallabox:events', 0, limit - 1);
    const events = raw.map((r) => {
      try { return JSON.parse(r); } catch { return { parseError: true, raw: r }; }
    });
    return res.status(200).json({ count: events.length, events });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
