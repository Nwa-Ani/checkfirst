import express from 'express';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { allowedOrigins, isAllowedOrigin, WEB_APP_ID, EXTENSION_ID, TOKEN_TTL_MS } from './origin.js';
import { createRateLimiter, clientIp } from './rate-limit.js';

const PORT = Number(process.env.PORT) || 8787;
const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production';
const origins = allowedOrigins();
const allowOrigin = (origin) => isAllowedOrigin(origin, origins);
const rateLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: Number(process.env.RATE_LIMIT_MAX) || 20 });

function loadAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing');
  }
  let creds;
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  if (!creds.project_id || !creds.private_key || !creds.client_email) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields');
  }
  initializeApp({ credential: cert(creds) });
}

loadAdmin();

const app = express();
app.disable('x-powered-by');
if (trustProxy) app.set('trust proxy', 1);
app.use(express.json({ limit: '1kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, accept');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    return res.status(allowOrigin(origin) ? 204 : 403).end();
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'checkfirst-appcheck' });
});

app.post('/appcheck-token', async (req, res) => {
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
  try {
    const minted = await getAppCheck().createToken(WEB_APP_ID, { ttlMillis: TOKEN_TTL_MS });
    const expireTimeMillis = Date.now() + (Number(minted.ttlMillis) || TOKEN_TTL_MS);
    // Never log the token or the service account.
    return res.json({ token: minted.token, expireTimeMillis });
  } catch (err) {
    console.error('appcheck-token failed', err?.code || err?.name || 'error');
    return res.status(500).json({ error: 'token_mint_failed' });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`checkfirst-appcheck listening on ${PORT} for extension ${EXTENSION_ID}`);
});
