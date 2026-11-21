// Pure website-address checks and verdict combining. No network.
// Used by the site, the extension, the helper, and tests.

export const SITE_VERDICTS = ['good', 'cautious', 'risky', 'bad', 'malicious'];

export const SAFE_BROWSING_TEST_URLS = [
  'http://testsafebrowsing.appspot.com/s/malware.html',
  'http://testsafebrowsing.appspot.com/s/phishing.html',
  'http://testsafebrowsing.appspot.com/s/unwanted.html',
  'http://malware.testing.google.test/testing/malware/',
];

const MULTI_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk',
  'com.ng', 'org.ng', 'gov.ng', 'edu.ng', 'net.ng',
  'co.za', 'org.za', 'web.za', 'gov.za',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp',
  'com.br', 'com.mx', 'com.ar', 'com.tr',
  'co.in', 'co.kr', 'co.nz', 'com.tw',
  'com.cn', 'co.id', 'com.pk', 'com.bd',
]);

const RISKY_TLDS = new Set([
  'zip', 'mov', 'top', 'xyz', 'click', 'link', 'live', 'shop', 'rest',
  'cam', 'icu', 'buzz', 'monster', 'quest', 'sbs', 'cfd', 'support',
  'work', 'gq', 'tk', 'ml', 'cf', 'ga', 'country', 'loan', 'men',
  'review', 'science', 'kim', 'date', 'faith', 'racing', 'win', 'bid',
]);

const BRANDS = [
  'paypal', 'google', 'gmail', 'apple', 'amazon', 'microsoft', 'netflix',
  'facebook', 'instagram', 'whatsapp', 'binance', 'coinbase', 'dhl',
  'fedex', 'ups', 'usps', 'chase', 'wellsfargo', 'bankofamerica',
  'hsbc', 'barclays', 'gtbank', 'accessbank', 'firstbank',
];

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly',
  'rb.gy', 'ow.ly', 'shorturl.at', 'tiny.cc', 'lnkd.in',
]);

const WELL_KNOWN = new Set([
  'google.com', 'google.com.ng', 'youtube.com', 'gmail.com', 'gstatic.com',
  'microsoft.com', 'apple.com', 'wikipedia.org', 'github.com', 'mozilla.org',
  'cloudflare.com', 'amazon.com', 'meta.com', 'facebook.com', 'instagram.com',
  'whatsapp.com', 'linkedin.com', 'x.com', 'twitter.com',
]);

const REDIRECT_KEYS = /(?:^|[?&#/])(url|redirect|redir|next|return|returnurl|continue|destination|dest|target|goto|out|forward|link)=/i;

const RANK = { good: 0, cautious: 1, risky: 2, bad: 3, malicious: 4 };

export function looksLikeUrl(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length !== 1) return false;
  const s = parts[0];
  if (/@/.test(s) && !/^https?:\/\//i.test(s)) return false;
  if (/^https?:\/\/.+/.test(s)) return true;
  if (/^www\./i.test(s)) return true;
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(s);
}

export function parseSiteUrl(input) {
  const raw = String(input || '').trim().split(/\s+/)[0] || '';
  if (!raw) return null;
  const userTypedScheme = /^https?:\/\//i.test(raw);
  const href = userTypedScheme ? raw : `https://${raw}`;
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!host) return null;
  if (!isIpHost(host) && !host.includes('.')) return null;
  return {
    url,
    href: url.href,
    host,
    userTypedScheme,
    raw,
  };
}

export function isIpHost(host) {
  const h = String(host || '').replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.includes(':')) return true;
  return false;
}

export function registrableDomain(host) {
  const h = String(host || '').replace(/\.$/, '').toLowerCase();
  if (isIpHost(h)) return h;
  const labels = h.split('.').filter(Boolean);
  if (labels.length <= 2) return h;
  const last2 = labels.slice(-2).join('.');
  if (MULTI_SUFFIXES.has(last2) && labels.length >= 3) return labels.slice(-3).join('.');
  return last2;
}

export function isWellKnown(registrable) {
  return WELL_KNOWN.has(String(registrable || '').toLowerCase());
}

const deLeet = (s) => String(s || '')
  .replace(/0/g, 'o')
  .replace(/1/g, 'l')
  .replace(/3/g, 'e')
  .replace(/4/g, 'a')
  .replace(/5/g, 's')
  .replace(/7/g, 't')
  .replace(/rn/g, 'm')
  .replace(/vv/g, 'w');

function safeDecode(s) {
  try { return decodeURIComponent(String(s || '').replace(/\+/g, ' ')); } catch { return String(s || ''); }
}

function looksLikeNestedUrl(text) {
  return /https?:\/\/|www\./i.test(text) || /(?:^|[=/])[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.test(text);
}

function add(signals, id, level, text) {
  if (signals.some((s) => s.id === id)) return;
  signals.push({ id, level, text });
}

export function inspectUrl(input) {
  const parsed = parseSiteUrl(input);
  const signals = [];
  if (!parsed) {
    const text = 'That does not look like a website address';
    return {
      ok: false,
      flags: [text],
      signals: [{ id: 'invalid', level: 'bad', text }],
      suggested: 'bad',
    };
  }

  const { url, host, userTypedScheme } = parsed;
  const registrable = registrableDomain(host);
  const labels = host.split('.').filter(Boolean);
  const wellKnown = isWellKnown(registrable);

  if (isIpHost(host)) {
    add(signals, 'ip_host', 'bad', `The address goes to a raw IP (${host}), not a named website`);
  }
  if (host.includes('xn--')) {
    add(signals, 'punycode', 'bad', `The address uses look-alike international characters (${host})`);
  }
  if (SHORTENERS.has(registrable)) {
    add(signals, 'shortener', 'risky', `This is a shortened link (${registrable}), so the real destination is hidden`);
  }
  const tld = labels[labels.length - 1] || '';
  if (RISKY_TLDS.has(tld) && !wellKnown) {
    add(signals, 'odd_tld', 'risky', `The domain ending .${tld} is often used for throwaway scam sites`);
  }
  if (labels.length >= 5) {
    add(signals, 'deep_labels', 'cautious', `The address has an unusually long chain of names (${host})`);
  }
  if (userTypedScheme && url.protocol === 'http:' && !wellKnown) {
    add(signals, 'http_only', 'cautious', 'The address uses http, not a secure https connection');
  }
  if (url.username || url.password) {
    add(signals, 'userinfo', 'bad', 'The address hides a username or password in the link itself');
  }

  const name = registrable.split('.')[0] || '';
  const regLabels = registrable.split('.');
  const startReg = Math.max(0, labels.length - regLabels.length);
  for (const brand of BRANDS) {
    const owns = name === brand || deLeet(name) === brand;
    const inSubdomain = labels.some((label, i) => {
      if (i >= startReg) return false;
      const l = deLeet(label);
      return label === brand || label.includes(brand) || l === brand || l.includes(brand);
    });
    const looksLike = !owns && (
      deLeet(name) === brand
      || (name.length > 3 && (deLeet(name).includes(brand) || name.includes(brand)))
    );
    if (!owns && inSubdomain) {
      add(signals, 'brand_subdomain', 'bad', `"${host}" puts the name ${brand} in a subdomain, but the real site is ${registrable}`);
      break;
    }
    if (looksLike) {
      add(signals, 'lookalike', 'bad', `"${host}" imitates ${brand} but is not its real domain`);
      break;
    }
  }

  if ((name.match(/-/g) || []).length >= 2 && !wellKnown) {
    add(signals, 'hyphens', 'cautious', `The domain is stuffed with hyphens (${registrable})`);
  }

  const full = `${url.pathname}${url.search}${url.hash}`;
  const hay = `${full} ${safeDecode(full)}`;
  if (REDIRECT_KEYS.test(hay) && looksLikeNestedUrl(hay)) {
    add(signals, 'redirect_string', 'risky', 'The address carries a long redirect to another site, a common phishing trick');
  } else if (full.length > 180 && !wellKnown) {
    add(signals, 'long_path', 'cautious', 'The address is unusually long, which can hide a redirect or tracking trick');
  }

  return {
    ok: true,
    input: String(input || '').trim(),
    href: url.href,
    host,
    registrable,
    wellKnown,
    userTypedScheme,
    flags: signals.map((s) => s.text),
    signals,
    suggested: suggestedFrom(signals, wellKnown),
  };
}

function suggestedFrom(signals, wellKnown) {
  const serious = signals.filter((s) => ['lookalike', 'brand_subdomain', 'punycode', 'ip_host', 'userinfo'].includes(s.id));
  if (wellKnown && !serious.length) return 'good';
  let best = 'good';
  for (const s of signals) {
    if ((RANK[s.level] || 0) > RANK[best]) best = s.level;
  }
  return best;
}

function bumpTowardBad(verdict, steps) {
  const order = SITE_VERDICTS;
  const cap = order.indexOf('bad');
  const i = Math.min(cap, Math.max(0, order.indexOf(verdict)) + steps);
  return order[i];
}

export function decideSiteVerdict({ structure, safeBrowsing, rdap } = {}) {
  if (safeBrowsing?.matches?.length) return 'malicious';
  let verdict = structure?.suggested || (structure?.ok === false ? 'bad' : 'good');
  if (structure?.wellKnown && !hasSeriousStructure(structure) && verdict !== 'malicious') {
    return 'good';
  }
  const ageDays = rdap?.ageDays;
  if (typeof ageDays === 'number') {
    if (ageDays < 7) verdict = bumpTowardBad(verdict, 2);
    else if (ageDays < 30) verdict = bumpTowardBad(verdict, 1);
  }
  return SITE_VERDICTS.includes(verdict) ? verdict : 'cautious';
}

function hasSeriousStructure(structure) {
  return (structure?.signals || []).some((s) => ['lookalike', 'brand_subdomain', 'punycode', 'ip_host', 'userinfo'].includes(s.id));
}

export function prettyThreat(type) {
  const map = {
    MALWARE: 'malware',
    SOCIAL_ENGINEERING: 'phishing',
    UNWANTED_SOFTWARE: 'unwanted software',
    POTENTIALLY_HARMFUL_APPLICATION: 'a harmful app',
  };
  return map[String(type || '')] || 'an unsafe site';
}

function asSentence(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function sortedSignals(structure) {
  return [...(structure?.signals || [])].sort((a, b) => (RANK[b.level] || 0) - (RANK[a.level] || 0));
}

export function reasonFromSignals({ verdict, structure, safeBrowsing, rdap } = {}) {
  if (safeBrowsing?.matches?.length) {
    const types = [...new Set(safeBrowsing.matches.map((m) => prettyThreat(m.threatType)))].join(', ');
    return `Google Safe Browsing has already flagged this address as ${types}. Do not open it.`;
  }
  if (!structure?.ok) return 'This does not look like a usable website address.';
  const host = structure.host || 'this address';
  if (verdict === 'good') {
    if (safeBrowsing?.configured) {
      return `${host} looks like a normal website address, and Google Safe Browsing has no warning for it.`;
    }
    return `${host} looks like a normal website address. Google Safe Browsing is not connected yet, so this is based on the address only.`;
  }
  const first = sortedSignals(structure).slice(0, 2).map((s) => asSentence(s.text)).join(' ');
  if (typeof rdap?.ageDays === 'number' && rdap.ageDays < 30) {
    return `${first || 'This domain is very new.'} It was registered only ${rdap.ageDays} day${rdap.ageDays === 1 ? '' : 's'} ago.`.trim();
  }
  return first || 'The address has some warning signs.';
}

export function whatToDo(verdict) {
  if (verdict === 'good') {
    return ['This looks fine, but if something still feels off, open the official app or a page you already trust.'];
  }
  if (verdict === 'cautious') {
    return ['Check the address closely before signing in or paying.', 'If you need the real site, type the address you already know yourself.'];
  }
  if (verdict === 'risky') {
    return ['Do not sign in or pay here.', 'Open the official site yourself by typing the address you already know.'];
  }
  if (verdict === 'malicious') {
    return ['Do not open this site.', 'Do not enter a password, code or card number.', 'Go to the official site yourself, or use the official app.'];
  }
  return ['This looks like a fake or look-alike site.', 'Do not enter a password, code or card number.', 'Open the official site yourself by typing the address you already know.'];
}

export function collectFlags({ structure, safeBrowsing, rdap } = {}) {
  const flags = [];
  if (safeBrowsing?.matches?.length) {
    const types = [...new Set(safeBrowsing.matches.map((m) => prettyThreat(m.threatType)))].join(', ');
    flags.push(`Google Safe Browsing flagged this as ${types}`);
  }
  for (const signal of sortedSignals(structure)) flags.push(signal.text);
  if (typeof rdap?.ageDays === 'number' && rdap.ageDays < 30) {
    flags.push(`This domain was registered only ${rdap.ageDays} day${rdap.ageDays === 1 ? '' : 's'} ago`);
  }
  if (!flags.length && structure?.ok) {
    if (safeBrowsing?.configured) flags.push('Not on Google\'s unsafe list');
    if (typeof rdap?.ageDays === 'number' && rdap.ageDays >= 365) {
      const years = Math.floor(rdap.ageDays / 365);
      flags.push(`Domain registered for about ${years} year${years === 1 ? '' : 's'}`);
    }
    if (!flags.length) flags.push('No warning signs in the address itself');
  }
  return [...new Set(flags)];
}
