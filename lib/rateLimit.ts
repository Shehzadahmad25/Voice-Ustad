/**
 * Simple in-memory rate limiter.
 *
 * LIMITATION: Each Vercel serverless instance has its own store.
 * For cross-instance rate limiting, replace with Upstash Redis:
 *   https://docs.upstash.com/redis/sdks/ratelimit-ts/overview
 *
 * This is still effective for MVP protection — most bot attacks
 * hit the same warm instance repeatedly.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Clean up expired entries every 2 minutes to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (now > val.resetAt) store.delete(key);
  }
}, 120_000);

/**
 * @param key        - Unique key (e.g. userId or IP)
 * @param maxPerMin  - Max requests allowed per minute window
 */
export function checkRateLimit(
  key: string,
  maxPerMin = 20,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const windowMs = 60_000;

  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return { ok: true, retryAfterMs: 0 };
  }

  entry.count += 1;

  if (entry.count > maxPerMin) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }

  return { ok: true, retryAfterMs: 0 };
}
