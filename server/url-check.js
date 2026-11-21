import { parseSiteUrl, registrableDomain } from '../src/url-signals.js';

export function createUrlCheckHandler({
  allowOrigin,
  rateLimit,
  trustProxy,
  lookupSafeBrowsing,
  lookupRdap,
  clientIp,
} = {}) {
  return async function handleUrlCheck(req, res) {
    const origin = req.headers.origin;
    if (!allowOrigin(origin)) {
      return res.status(403).json({ error: 'origin_not_allowed' });
    }
    const ip = clientIp(req, trustProxy);
    const limit = rateLimit(ip);
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    if (!limit.ok) {
      const retry = Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: 'rate_limited' });
    }
    const parsed = parseSiteUrl(req.body?.url);
    if (!parsed) {
      return res.status(400).json({ error: 'invalid_url' });
    }
    try {
      const [safeBrowsing, rdap] = await Promise.all([
        lookupSafeBrowsing(parsed.href),
        lookupRdap(registrableDomain(parsed.host)),
      ]);
      return res.json({
        ok: true,
        url: parsed.href,
        host: parsed.host,
        safeBrowsing,
        rdap,
      });
    } catch (err) {
      console.error('url-check failed', err?.code || err?.name || 'error');
      return res.status(500).json({ error: 'url_check_failed' });
    }
  };
}
