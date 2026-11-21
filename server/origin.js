// Origin allowlist helpers. No secrets here.
export const WEB_APP_ID = '1:30431888759:web:a9c46a3a9b58ca5e87cd72';
export const EXTENSION_ID = 'aahdbhdmlfblabbdhoffijbkndlenjcf';
export const TOKEN_TTL_MS = 30 * 60 * 1000;

const DEFAULT_SITE_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173';

export function allowedOrigins({
  extensionId = process.env.EXTENSION_ID || EXTENSION_ID,
  allowedOriginsEnv = process.env.ALLOWED_ORIGINS,
  siteOrigin = process.env.SITE_ORIGIN || process.env.VITE_PUBLIC_SITE_URL,
} = {}) {
  const origins = new Set();
  if (extensionId) origins.add(`chrome-extension://${extensionId}`);
  const extra = allowedOriginsEnv == null || allowedOriginsEnv === '' ? DEFAULT_SITE_ORIGINS : allowedOriginsEnv;
  for (const item of extra.split(',')) {
    const origin = item.trim().replace(/\/$/, '');
    if (origin) origins.add(origin);
  }
  if (siteOrigin) origins.add(String(siteOrigin).trim().replace(/\/$/, ''));
  return origins;
}

export function isAllowedOrigin(origin, origins) {
  return Boolean(origin) && origins.has(origin);
}
