// Simple in-memory per-IP limiter. Enough for a single Render instance.
export function createRateLimiter({ windowMs = 10 * 60 * 1000, max = 20 } = {}) {
  const hits = new Map();

  function prune(now) {
    for (const [ip, entry] of hits) {
      if (entry.reset <= now) hits.delete(ip);
    }
  }

  return function rateLimit(ip) {
    const now = Date.now();
    if (hits.size > 5000) prune(now);
    const key = ip || 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      const next = { count: 1, reset: now + windowMs };
      hits.set(key, next);
      return { ok: true, remaining: max - 1, reset: next.reset };
    }
    if (entry.count >= max) {
      return { ok: false, remaining: 0, reset: entry.reset };
    }
    entry.count += 1;
    return { ok: true, remaining: max - entry.count, reset: entry.reset };
  };
}

export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
