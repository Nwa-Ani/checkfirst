const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

export const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
];

export function hasSafeBrowsingKey(key = process.env.SAFE_BROWSING_API_KEY) {
  return Boolean(key && String(key).trim());
}

export async function lookupSafeBrowsing(url, {
  apiKey = process.env.SAFE_BROWSING_API_KEY,
  fetchImpl = fetch,
  timeoutMs = 4000,
} = {}) {
  if (!hasSafeBrowsingKey(apiKey)) {
    return { configured: false, matches: [] };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(String(apiKey).trim())}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'checkfirst', clientVersion: '0.4.0' },
        threatInfo: {
          threatTypes: THREAT_TYPES,
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { configured: true, error: 'lookup_failed', matches: [] };
    }
    const data = await res.json().catch(() => ({}));
    const matches = Array.isArray(data?.matches)
      ? data.matches.map((m) => ({
        threatType: m.threatType || 'UNKNOWN',
        platformType: m.platformType,
        threatEntryType: m.threatEntryType,
      }))
      : [];
    return { configured: true, matches };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return { configured: true, error: aborted ? 'timeout' : 'lookup_failed', matches: [] };
  } finally {
    clearTimeout(timer);
  }
}
