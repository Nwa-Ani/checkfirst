import { scan } from './heuristics.js';

const LABEL = { scam: 'Looks like a scam', suspicious: 'Be careful, some warning signs', likely_safe: 'No obvious scam signs' };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function onDeviceOpinion(text, instant) {
  // Chrome's built-in Gemini Nano (Prompt API). Nothing leaves the device. Skipped if unavailable.
  if (typeof LanguageModel === 'undefined') return null;
  const status = await LanguageModel.availability();
  if (status !== 'available') return { note: `On-device AI is ${status}; instant scan shown.` };
  const session = await LanguageModel.create();
  const prompt = `You check messages and links for scams for everyday people. Signals already found: ${instant.flags.join('; ') || 'none'}.\nIn two short plain sentences, say whether this looks like a scam and what the person should do.\n\n---\n${text.slice(0, 4000)}`;
  const reply = await session.prompt(prompt);
  session.destroy?.();
  return { reply };
}

async function check(text) {
  if (!text.trim()) return;
  const t0 = performance.now();
  const r = scan(text);
  const ms = Math.round(performance.now() - t0);
  $('out').innerHTML = `<div class="verdict ${r.verdict}">${LABEL[r.verdict]} (risk ${r.score}/100)</div>
    ${r.flags.length ? `<ul>${r.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    <div class="meta">Instant scan ran on this device in ${ms} ms, no internet needed.</div>
    <div class="ai" id="ai">Asking on-device AI...</div>`;
  try {
    const ai = await onDeviceOpinion(text, r);
    $('ai').textContent = ai ? (ai.reply || ai.note) : 'On-device AI is not available in this browser; instant scan shown.';
  } catch (e) {
    $('ai').textContent = 'On-device AI could not run; instant scan shown.';
  }
}

$('go').addEventListener('click', () => check($('input').value));

const { pending } = await chrome.storage.session.get('pending');
if (pending && Date.now() - pending.at < 60000) {
  await chrome.storage.session.remove('pending');
  $('input').value = pending.input || '';
  check($('input').value);
}
