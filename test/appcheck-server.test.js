import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins, isAllowedOrigin, EXTENSION_ID, WEB_APP_ID } from '../server/origin.js';
import { createRateLimiter } from '../server/rate-limit.js';

test('allowlist includes the pinned extension ID and default site origins', () => {
  const origins = allowedOrigins({ allowedOriginsEnv: '', siteOrigin: '' });
  assert.equal(WEB_APP_ID, '1:30431888759:web:a9c46a3a9b58ca5e87cd72');
  assert.ok(origins.has(`chrome-extension://${EXTENSION_ID}`));
  assert.ok(origins.has('http://127.0.0.1:5173'));
  assert.ok(origins.has('http://localhost:5173'));
  assert.equal(isAllowedOrigin(undefined, origins), false);
  assert.equal(isAllowedOrigin('https://evil.example', origins), false);
  assert.ok(isAllowedOrigin(`chrome-extension://${EXTENSION_ID}`, origins));
});

test('site origin from env is allowed and trailing slashes are ignored', () => {
  const origins = allowedOrigins({
    allowedOriginsEnv: 'https://checkfirst.example',
    siteOrigin: 'https://hosted.example/',
  });
  assert.ok(isAllowedOrigin('https://checkfirst.example', origins));
  assert.ok(isAllowedOrigin('https://hosted.example', origins));
  assert.equal(isAllowedOrigin('https://hosted.example/', origins), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173', origins), false);
});

test('rate limiter blocks a single IP after the max', () => {
  const limit = createRateLimiter({ windowMs: 60_000, max: 3 });
  assert.equal(limit('1.1.1.1').ok, true);
  assert.equal(limit('1.1.1.1').ok, true);
  assert.equal(limit('1.1.1.1').ok, true);
  assert.equal(limit('1.1.1.1').ok, false);
  assert.equal(limit('2.2.2.2').ok, true);
});
