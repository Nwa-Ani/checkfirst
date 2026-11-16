// Instant, offline red-flag scan. Runs before any model call, needs no AI and no network.
// It gives the AI concrete signals and gives the user a result even with no model available.

const URGENCY = /\b(urgent|immediately|within (24|48) hours|final notice|act now|last chance|account (will be )?(suspended|locked|closed|blocked)|verify (your )?account|unusual (sign[- ]?in|activity))\b/i;
const SECRETS = /\b(otp|one[- ]time (pass)?code|verification code|pin|password|cvv|card number|bvn|ssn|seed phrase|recovery phrase|private key)\b/i;
const MONEY = /\b(gift ?cards?|wire transfer|western union|crypto(currency)?|bitcoin|usdt|processing fee|release fee|customs fee|clearance fee|refund|you (have )?won|lottery|prize|inheritance|investment (plan|opportunity)|double your)\b/i;
const JOB = /\b(work from home|earn \$?\d+.{0,12}(per|an|a) (hour|day)|no experience (needed|required)|telegram|whatsapp me|task(s)? (job|income))\b/i;
const IMPERSONATION = /\b(bank|paypal|amazon|apple|microsoft|netflix|dhl|fedex|ups|usps|post office|irs|tax office|customs|police|support team|help ?desk|security team)\b/i;
const SHORTENERS = /^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|ow\.ly|shorturl\.at|tiny\.cc)$/i;
const RISKY_TLDS = /\.(zip|mov|top|xyz|click|link|live|shop|rest|cam|icu|buzz|monster|quest|sbs|cfd|support|work)$/i;
const BRANDS = ['paypal', 'google', 'apple', 'amazon', 'microsoft', 'netflix', 'facebook', 'instagram', 'whatsapp', 'binance', 'coinbase', 'dhl', 'fedex', 'chase', 'wellsfargo'];

export function extractUrls(text) {
  const re = /\b((?:https?:\/\/|www\.)[^\s<>"')]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s<>"')]*)?)/gi;
  const out = [];
  for (const m of text.matchAll(re)) {
    let raw = m[0].replace(/[.,;:!?]+$/, '');
    if (/^[\w.+-]+@/.test(text.slice(Math.max(0, m.index - 64), m.index + raw.length).split(/\s/).pop() || '')) continue; // skip emails
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
      if (!u.hostname.includes('.')) continue;
      out.push({ raw, host: u.hostname.toLowerCase(), https: /^https:/i.test(raw) });
    } catch { /* ignore */ }
  }
  return out;
}

const deLeet = (s) => s.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/rn/g, 'm').replace(/vv/g, 'w');

export function checkHost(host) {
  const flags = [];
  const labels = host.split('.');
  const registrable = labels.slice(-2).join('.');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) flags.push(`Link goes to a raw IP address (${host}), not a named website`);
  if (host.includes('xn--')) flags.push(`Link uses look-alike international characters (${host})`);
  if (SHORTENERS.test(registrable)) flags.push(`Link is shortened (${registrable}), so the real destination is hidden`);
  if (RISKY_TLDS.test(host)) flags.push(`Domain ending often used in throwaway scam sites (${host})`);
  if (labels.length >= 5) flags.push(`Unusually deep web address (${host})`);
  const name = labels.slice(-2, -1)[0] || '';
  for (const b of BRANDS) {
    const ownsBrand = name === b;
    if (ownsBrand) break;
    const mentions = host.includes(b);
    const looksLike = deLeet(name) === b || (name.length > 3 && deLeet(name).includes(b));
    if (mentions || looksLike) { flags.push(`"${host}" imitates ${b} but is not its real domain`); break; }
  }
  if ((name.match(/-/g) || []).length >= 2) flags.push(`Domain stuffed with hyphens (${host})`);
  return flags;
}

export function scan(text = '') {
  const flags = [];
  let score = 0;
  const add = (msg, pts) => { flags.push(msg); score += pts; };
  if (URGENCY.test(text)) add('Pressure to act fast or lose access', 15);
  if (SECRETS.test(text)) add('Asks for a code, password, PIN or other secret', 30);
  if (MONEY.test(text)) add('Mentions prizes, fees, gift cards, crypto or refunds', 20);
  if (JOB.test(text)) add('Too-good-to-be-true job or income offer', 20);
  if (IMPERSONATION.test(text)) add('Claims to be a bank, delivery company, brand or official body', 10);
  const urls = extractUrls(text);
  for (const u of urls) {
    for (const f of checkHost(u.host)) add(f, 25);
    if (!u.https && /^http:\/\//i.test(u.raw)) add(`Link is not secure (http, not https): ${u.host}`, 5);
  }
  score = Math.min(100, score);
  const verdict = score >= 50 ? 'scam' : score >= 20 ? 'suspicious' : 'likely_safe';
  return { score, verdict, flags: [...new Set(flags)], urls: urls.map((u) => u.host) };
}
