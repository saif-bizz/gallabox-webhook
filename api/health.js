export default function handler(req, res) {
  const hasRedis = Boolean(
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  );
  res.status(200).json({
    status: 'ok',
    service: 'gallabox-webhook',
    timestamp: new Date().toISOString(),
    redis: hasRedis,
    secretConfigured: Boolean(process.env.WEBHOOK_SHARED_SECRET),
  });
}
