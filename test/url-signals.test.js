import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectUrl,
  decideSiteVerdict,
  looksLikeUrl,
  parseSiteUrl,
  registrableDomain,
  reasonFromSignals,
  collectFlags,
  SAFE_BROWSING_TEST_URLS,
} from '../src/url-signals.js';
import { mergeAiSiteResult, helperBaseUrl, collectSiteCheck } from '../src/site-check.js';
import { SITE_SAMPLES, getSiteSample } from '../src/site-samples.js';

test('google.com comes out Good with no Safe Browsing hit', () => {
  for (const input of ['google.com', 'https://www.google.com', 'https://google.com/', 'http://google.com']) {
    const structure = inspectUrl(input);
    assert.equal(structure.ok, true, input);
    assert.equal(structure.registrable, 'google.com', input);
    const verdict = decideSiteVerdict({
      structure,
      safeBrowsing: { configured: true, matches: [] },
    });
    assert.equal(verdict, 'good', input);
  }
});

test('Safe Browsing test URLs are Malicious when the API reports a match', () => {
  for (const url of SAFE_BROWSING_TEST_URLS) {
    const structure = inspectUrl(url);
    const verdict = decideSiteVerdict({
      structure,
      safeBrowsing: { configured: true, matches: [{ threatType: 'MALWARE' }] },
    });
    assert.equal(verdict, 'malicious', url);
    const reason = reasonFromSignals({
      verdict,
      structure,
      safeBrowsing: { configured: true, matches: [{ threatType: 'MALWARE' }] },
    });
    assert.match(reason, /Safe Browsing/i);
  }
});

test('lookalike, punycode, IP hosts and brand subdomains are Bad', () => {
  assert.equal(inspectUrl('http://paypa1-secure-login.top/verify').suggested, 'bad');
  assert.equal(inspectUrl('https://xn--80ak6aa92e.com/').suggested, 'bad');
  assert.equal(inspectUrl('http://192.168.4.20/login').suggested, 'bad');
  assert.equal(inspectUrl('https://paypal.secure-account.xyz/login').suggested, 'bad');
  const sub = inspectUrl('https://paypal.secure-account.xyz/login');
  assert.ok(sub.flags.some((f) => /subdomain/i.test(f) && /paypal/i.test(f)));
});

test('http only, odd TLDs and long redirect strings raise Cautious or Risky', () => {
  const httpOnly = inspectUrl('http://smallshop.example.com/about');
  assert.equal(httpOnly.suggested, 'cautious');
  assert.ok(httpOnly.flags.some((f) => /http/i.test(f)));

  const odd = inspectUrl('https://random-shop.top/');
  assert.equal(odd.suggested, 'risky');

  const redirect = inspectUrl('https://help-desk.top/go?url=https://paypa1-secure-login.top/verify');
  assert.ok(redirect.signals.some((s) => s.id === 'redirect_string'));
  assert.ok(['risky', 'bad'].includes(redirect.suggested));
});

test('real brand domains are not treated as lookalikes', () => {
  assert.equal(inspectUrl('https://accounts.google.com').suggested, 'good');
  assert.equal(inspectUrl('https://www.paypal.com').suggested, 'good');
  assert.equal(registrableDomain('mail.google.com.ng'), 'google.com.ng');
});

test('a young domain bumps Good up, but never to Malicious without Safe Browsing', () => {
  const structure = inspectUrl('https://brandnewsite.example');
  assert.equal(decideSiteVerdict({
    structure,
    safeBrowsing: { configured: true, matches: [] },
    rdap: { available: true, ageDays: 3 },
  }), 'risky');
  assert.equal(decideSiteVerdict({
    structure,
    safeBrowsing: { configured: true, matches: [] },
    rdap: { available: true, ageDays: 20 },
  }), 'cautious');
  assert.equal(decideSiteVerdict({
    structure: inspectUrl('http://paypa1-secure-login.top/verify'),
    safeBrowsing: { configured: true, matches: [] },
    rdap: { available: true, ageDays: 1 },
  }), 'bad');
});

test('looksLikeUrl accepts a bare host and rejects a full message', () => {
  assert.equal(looksLikeUrl('google.com'), true);
  assert.equal(looksLikeUrl('https://www.google.com/search?q=hi'), true);
  assert.equal(looksLikeUrl('Hey, are we still meeting at 1pm?'), false);
  assert.equal(looksLikeUrl('user@example.com'), false);
  assert.equal(parseSiteUrl('javascript:alert(1)'), null);
});

test('mergeAiSiteResult cannot downgrade a Safe Browsing match', () => {
  const collected = {
    verdict: 'malicious',
    reason: 'flagged',
    flags: ['Google Safe Browsing flagged this as malware'],
    todo: ['Do not open this site.'],
    safeBrowsing: { configured: true, matches: [{ threatType: 'MALWARE' }] },
  };
  const merged = mergeAiSiteResult(collected, { verdict: 'good', reason: 'looks fine', signals: [], what_to_do: [] });
  assert.equal(merged.verdict, 'malicious');
});

test('helperBaseUrl prefers an explicit helper, then the token URL origin', () => {
  assert.equal(helperBaseUrl({ VITE_HELPER_URL: 'https://helper.example/' }), 'https://helper.example');
  assert.equal(helperBaseUrl({ VITE_APPCHECK_TOKEN_URL: 'http://127.0.0.1:8787/appcheck-token' }), 'http://127.0.0.1:8787');
  assert.equal(helperBaseUrl({}), '');
});

test('website demo samples are present and inspectable', () => {
  assert.equal(SITE_SAMPLES.length, 5);
  assert.ok(getSiteSample('google'));
  assert.ok(getSiteSample('sb-malware'));
  assert.equal(inspectUrl(getSiteSample('google').url).suggested, 'good');
  assert.equal(inspectUrl(getSiteSample('paypal-lookalike').url).suggested, 'bad');
});

test('collectSiteCheck uses helper signals when provided', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      url: 'http://testsafebrowsing.appspot.com/s/malware.html',
      safeBrowsing: { configured: true, matches: [{ threatType: 'MALWARE' }] },
      rdap: { available: false },
    }),
  });
  const result = await collectSiteCheck(SAFE_BROWSING_TEST_URLS[0], {
    fetchImpl,
    env: { VITE_HELPER_URL: 'https://helper.example' },
  });
  assert.equal(result.verdict, 'malicious');
  assert.ok(collectFlags(result).some((f) => /Safe Browsing/i.test(f)));
});

test('warning reasons lead with the strongest signal and use full sentences', () => {
  const structure = inspectUrl('http://paypa1-secure-login.top/verify');
  const verdict = decideSiteVerdict({ structure, safeBrowsing: { configured: true, matches: [] } });
  assert.equal(verdict, 'bad');
  const reason = reasonFromSignals({ verdict, structure, safeBrowsing: { configured: true, matches: [] } });
  assert.match(reason, /imitates paypal/i);
  assert.match(reason, /\. /);
  const flags = collectFlags({ structure, safeBrowsing: { configured: true, matches: [] } });
  assert.match(flags[0], /imitates paypal/i);
});
