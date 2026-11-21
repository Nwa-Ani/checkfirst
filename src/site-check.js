import {
  inspectUrl,
  decideSiteVerdict,
  reasonFromSignals,
  collectFlags,
  whatToDo,
  looksLikeUrl,
  parseSiteUrl,
} from './url-signals.js';

const PRODUCTION_HELPER = 'https://checkfirst-appcheck.onrender.com';

export { looksLikeUrl, parseSiteUrl };

export function helperBaseUrl(env = import.meta.env) {
  const explicit = env?.VITE_HELPER_URL;
  if (explicit) return String(explicit).replace(/\/$/, '');
  const token = env?.VITE_APPCHECK_TOKEN_URL;
  if (token) {
    try { return new URL(token).origin; } catch { /* ignore */ }
  }
  if (typeof location !== 'undefined' && location.hostname === 'checkfirst.onrender.com') {
    return PRODUCTION_HELPER;
  }
  return '';
}

export async function fetchHelperSignals(url, { fetchImpl = fetch, env } = {}) {
  const base = helperBaseUrl(env);
  if (!base) {
    return { skipped: true, safeBrowsing: { configured: false, matches: [] }, rdap: { available: false } };
  }
  const res = await fetchImpl(`${base}/url-check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = new Error('HELPER_HTTP');
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return {
    skipped: false,
    safeBrowsing: data.safeBrowsing || { configured: false, matches: [] },
    rdap: data.rdap || { available: false },
    url: data.url,
  };
}

export async function collectSiteCheck(input, options = {}) {
  const structure = inspectUrl(input);
  if (!structure.ok) {
    const verdict = 'bad';
    return {
      structure,
      safeBrowsing: { configured: false, matches: [] },
      rdap: { available: false },
      verdict,
      reason: reasonFromSignals({ verdict, structure }),
      flags: collectFlags({ structure }),
      todo: whatToDo(verdict),
    };
  }

  let helper = { skipped: true, safeBrowsing: { configured: false, matches: [] }, rdap: { available: false } };
  try {
    helper = await fetchHelperSignals(structure.href, options);
  } catch {
    helper = {
      skipped: true,
      safeBrowsing: { configured: false, matches: [], error: 'helper_unreachable' },
      rdap: { available: false },
    };
  }

  const safeBrowsing = helper.safeBrowsing || { configured: false, matches: [] };
  const rdap = helper.rdap || { available: false };
  const verdict = decideSiteVerdict({ structure, safeBrowsing, rdap });
  return {
    structure,
    safeBrowsing,
    rdap,
    verdict,
    reason: reasonFromSignals({ verdict, structure, safeBrowsing, rdap }),
    flags: collectFlags({ structure, safeBrowsing, rdap }),
    todo: whatToDo(verdict),
  };
}

export function mergeAiSiteResult(collected, data) {
  const allowed = new Set(['good', 'cautious', 'risky', 'bad', 'malicious']);
  let verdict = allowed.has(data?.verdict) ? data.verdict : collected.verdict;
  if (collected.safeBrowsing?.matches?.length) verdict = 'malicious';
  const flags = [...new Set([...(data?.signals || []), ...collected.flags])].slice(0, 8);
  return {
    ...collected,
    verdict,
    reason: String(data?.reason || collected.reason || '').trim() || collected.reason,
    flags,
    todo: (data?.what_to_do && data.what_to_do.length) ? data.what_to_do : collected.todo,
  };
}
