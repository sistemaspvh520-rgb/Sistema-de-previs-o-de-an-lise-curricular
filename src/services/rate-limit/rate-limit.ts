/**
 * Token bucket em memória (single-instance). Para múltiplas instâncias, substituir por Redis.
 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface RateLimitOptions {
  capacity: number;
  refillPerMinute: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, opts: RateLimitOptions, now = Date.now()): RateLimitResult {
  if (buckets.size > MAX_BUCKETS) buckets.clear();
  const bucket = buckets.get(key) ?? { tokens: opts.capacity, updatedAt: now };
  const elapsedMinutes = (now - bucket.updatedAt) / 60_000;
  bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsedMinutes * opts.refillPerMinute);
  bucket.updatedAt = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSeconds: 0 };
  }
  buckets.set(key, bucket);
  const retryAfterSeconds = Math.ceil(((1 - bucket.tokens) / opts.refillPerMinute) * 60);
  return { allowed: false, remaining: 0, retryAfterSeconds };
}

/** Apenas para testes. */
export function resetRateLimits() {
  buckets.clear();
}
