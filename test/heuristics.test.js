import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, checkHost } from '../src/heuristics.js';

test('flags classic phishing as scam', () => {
  const r = scan('Your account will be suspended. Verify your account within 24 hours: http://paypa1-secure-login.top/verify and send the OTP');
  assert.equal(r.verdict, 'scam');
  assert.ok(r.flags.some((f) => f.includes('imitates paypal')));
});
test('normal message is likely safe', () => {
  assert.equal(scan('Hey, are we still meeting for lunch at 1pm tomorrow?').verdict, 'likely_safe');
});
test('real brand domain not flagged', () => {
  assert.deepEqual(checkHost('www.paypal.com'), []);
  assert.deepEqual(checkHost('accounts.google.com'), []);
});
test('look-alike and shortener domains flagged', () => {
  assert.ok(checkHost('g00gle.com').length > 0);
  assert.ok(checkHost('bit.ly').length > 0);
  assert.ok(checkHost('192.168.4.20').length > 0);
});
test('job scam flagged', () => {
  assert.notEqual(scan('Work from home, earn $50 per hour, no experience needed, whatsapp me').verdict, 'likely_safe');
});
