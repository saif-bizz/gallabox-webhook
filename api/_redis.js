import { Redis } from '@upstash/redis';

let _redis = null;

export function getRedis() {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  _redis = new Redis({ url, token });
  return _redis;
}
