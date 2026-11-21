/** Read a check payload from a URL fragment only. Never use the query string. */
export function parseCheckHash(hash = '') {
  const raw = String(hash || '');
  const body = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!body.startsWith('check=')) return '';
  try {
    return decodeURIComponent(body.slice('check='.length)).trim();
  } catch {
    return '';
  }
}

export function parseSiteHash(hash = '') {
  const raw = String(hash || '');
  const body = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!body.startsWith('site=')) return '';
  try {
    return decodeURIComponent(body.slice('site='.length)).trim();
  } catch {
    return '';
  }
}

export function parseAppHash(hash = '', looksLikeUrl = () => false) {
  const site = parseSiteHash(hash);
  if (site) return { mode: 'site', text: site };
  const text = parseCheckHash(hash);
  if (!text) return null;
  return { mode: looksLikeUrl(text) ? 'site' : 'message', text };
}

export function buildCheckUrl(siteUrl, text) {
  const base = String(siteUrl || 'http://127.0.0.1:5173').replace(/\/$/, '');
  return `${base}/#check=${encodeURIComponent(text || '')}`;
}

export function buildSiteCheckUrl(siteUrl, url) {
  const base = String(siteUrl || 'http://127.0.0.1:5173').replace(/\/$/, '');
  return `${base}/#site=${encodeURIComponent(url || '')}`;
}
