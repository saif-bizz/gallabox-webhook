export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'gallabox-webhook',
    timestamp: new Date().toISOString(),
    kv: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    secretConfigured: Boolean(process.env.WEBHOOK_SHARED_SECRET),
  });
}
