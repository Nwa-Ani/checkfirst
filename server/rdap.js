import { isIpHost } from '../src/url-signals.js';

export async function lookupRdap(domain, { fetchImpl = fetch, timeoutMs = 2500 } = {}) {
  const name = String(domain || '').trim().toLowerCase();
  if (!name || isIpHost(name) || !name.includes('.')) {
    return { available: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(name)}`, {
      headers: {
        accept: 'application/rdap+json, application/json',
        'user-agent': 'CheckFirst/0.4',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return { available: false };
    const data = await res.json();
    const events = Array.isArray(data?.events) ? data.events : [];
    const registered = events.find((event) => String(event.eventAction || '').toLowerCase() === 'registration');
    const date = registered?.eventDate || null;
    if (!date) return { available: true, registered: null, ageDays: null };
    const ageDays = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
    if (!Number.isFinite(ageDays) || ageDays < 0) return { available: true, registered: date, ageDays: null };
    return { available: true, registered: date, ageDays };
  } catch {
    return { available: false };
  } finally {
    clearTimeout(timer);
  }
}
