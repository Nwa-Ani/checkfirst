import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUrlCheckHandler } from '../server/url-check.js';
import { lookupSafeBrowsing, hasSafeBrowsingKey } from '../server/safebrowsing.js';
import { lookupRdap } from '../server/rdap.js';
import { createRateLimiter } from '../server/rate-limit.js';

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function handler(overrides = {}) {
  return createUrlCheckHandler({
    allowOrigin: (origin) => origin === 'https://checkfirst.onrender.com',
    rateLimit: createRateLimiter({ windowMs: 60_000, max: 3 }),
    trustProxy: true,
    lookupSafeBrowsing: async () => ({ configured: true, matches: [] }),
    lookupRdap: async () => ({ available: true, registered: '1997-09-15T04:00:00Z', ageDays: 10000 }),
    clientIp: () => '203.0.113.10',
    ...overrides,
  });
}

test('url-check rejects a missing origin and a bad origin', async () => {
  const h = handler();
  const denied = mockRes();
  await h({ headers: {}, body: { url: 'https://google.com' } }, denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.error, 'origin_not_allowed');

  const bad = mockRes();
  await h({ headers: { origin: 'https://evil.example' }, body: { url: 'https://google.com' } }, bad);
  assert.equal(bad.statusCode, 403);
});

test('url-check rejects an invalid URL and serves a Good google.com lookup', async () => {
  const h = handler();
  const invalid = mockRes();
  await h({ headers: { origin: 'https://checkfirst.onrender.com' }, body: { url: 'not a site' } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const ok = mockRes();
  await h({ headers: { origin: 'https://checkfirst.onrender.com' }, body: { url: 'google.com' } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.host, 'google.com');
  assert.equal(ok.body.safeBrowsing.configured, true);
  assert.deepEqual(ok.body.safeBrowsing.matches, []);
  assert.equal(ok.body.rdap.ageDays, 10000);
});

test('url-check returns Safe Browsing matches for the official test URL', async () => {
  const h = handler({
    lookupSafeBrowsing: async (url) => {
      assert.match(url, /testsafebrowsing\.appspot\.com/);
      return { configured: true, matches: [{ threatType: 'MALWARE', platformType: 'ANY_PLATFORM' }] };
    },
  });
  const res = mockRes();
  await h({
    headers: { origin: 'https://checkfirst.onrender.com' },
    body: { url: 'http://testsafebrowsing.appspot.com/s/malware.html' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.safeBrowsing.matches[0].threatType, 'MALWARE');
});

test('url-check uses the same per-IP rate limit', async () => {
  const rateLimit = createRateLimiter({ windowMs: 60_000, max: 2 });
  const h = handler({ rateLimit });
  const a = mockRes();
  const b = mockRes();
  const c = mockRes();
  const req = { headers: { origin: 'https://checkfirst.onrender.com' }, body: { url: 'https://google.com' } };
  await h(req, a);
  await h(req, b);
  await h(req, c);
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  assert.equal(c.statusCode, 429);
  assert.equal(c.body.error, 'rate_limited');
});

test('lookupSafeBrowsing stays quiet when no key is set and parses a match when one is', async () => {
  assert.equal(hasSafeBrowsingKey(''), false);
  const none = await lookupSafeBrowsing('https://google.com', { apiKey: '' });
  assert.deepEqual(none, { configured: false, matches: [] });

  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      json: async () => ({ matches: [{ threatType: 'SOCIAL_ENGINEERING', platformType: 'ANY_PLATFORM' }] }),
    };
  };
  const hit = await lookupSafeBrowsing('http://testsafebrowsing.appspot.com/s/phishing.html', {
    apiKey: 'test-key',
    fetchImpl,
  });
  assert.equal(hit.configured, true);
  assert.equal(hit.matches[0].threatType, 'SOCIAL_ENGINEERING');
  assert.match(calls[0].url, /safebrowsing\.googleapis\.com\/v4\/threatMatches:find/);
  assert.doesNotMatch(calls[0].url, /test-key-should-not-appear-twice/);
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.threatInfo.threatEntries[0].url, 'http://testsafebrowsing.appspot.com/s/phishing.html');
});

test('lookupRdap reads a registration event and fails closed', async () => {
  const ok = await lookupRdap('google.com', {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ events: [{ eventAction: 'registration', eventDate: '1997-09-15T04:00:00.000Z' }] }),
    }),
  });
  assert.equal(ok.available, true);
  assert.ok(ok.ageDays > 1000);

  const down = await lookupRdap('google.com', {
    fetchImpl: async () => { throw new Error('network'); },
  });
  assert.deepEqual(down, { available: false });
});
