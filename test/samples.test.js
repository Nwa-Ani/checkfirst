import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from '../src/heuristics.js';
import { SAMPLES, getSample } from '../src/samples.js';
import { parseCheckHash, buildCheckUrl } from '../src/hash.js';

test('four demo samples are available', () => {
  assert.equal(SAMPLES.length, 4);
  assert.ok(getSample('bank-otp'));
  assert.ok(getSample('job'));
  assert.ok(getSample('crypto'));
  assert.ok(getSample('paypal'));
});

test('demo scam samples are not scored as likely safe', () => {
  for (const sample of SAMPLES) {
    const r = scan(sample.text);
    assert.notEqual(r.verdict, 'likely_safe', sample.id);
  }
});

test('PayPal locked sample is flagged as a scam', () => {
  const r = scan(getSample('paypal').text);
  assert.equal(r.verdict, 'scam');
  assert.ok(r.flags.some((f) => f.includes('imitates paypal')));
});

test('parseCheckHash reads the fragment only', () => {
  assert.equal(parseCheckHash(''), '');
  assert.equal(parseCheckHash('#nope=1'), '');
  assert.equal(parseCheckHash('#check=Hello%20world'), 'Hello world');
  assert.equal(parseCheckHash('check=Plain'), 'Plain');
});

test('buildCheckUrl puts the text in the fragment, not the query', () => {
  const url = buildCheckUrl('https://example.com/app/', 'a&b=c');
  assert.equal(url, 'https://example.com/app/#check=a%26b%3Dc');
  assert.ok(!url.includes('?'), url);
});
