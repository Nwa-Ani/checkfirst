import './popup.css';
import { scan } from '../src/heuristics.js';
import { SAMPLES, getSample } from '../src/samples.js';
import { buildCheckUrl } from '../src/hash.js';
import { LABEL, sourceLabel, prefersReducedMotion } from '../src/theme.js';
import { gaugeHtml, chipsHtml, sourceBadgeHtml, esc } from '../src/ui.js';
import { createScamCardCanvas, canvasToPngBlob, cardFileName } from '../src/card.js';

const $ = (id) => document.getElementById(id);
const SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://127.0.0.1:5173';
// Dev builds can use a debug token. Production builds use the App Check helper URL.
const USE_EXT_CLOUD = import.meta.env.VITE_APPCHECK_DEBUG === 'true'
  || Boolean(import.meta.env.VITE_APPCHECK_TOKEN_URL);
const USE_HELPER = Boolean(import.meta.env.VITE_APPCHECK_TOKEN_URL) && import.meta.env.VITE_APPCHECK_DEBUG !== 'true';

async function onDeviceOpinion(text, instant) {
  if (typeof LanguageModel === 'undefined') return { skipped: true, note: 'On-device AI is not available in this browser.' };
  const status = await LanguageModel.availability();
  if (status !== 'available') return { skipped: true, note: `On-device AI is ${status}.` };
  const session = await LanguageModel.create();
  const prompt = `You check messages and links for scams for everyday people. Signals already found: ${instant.flags.join('; ') || 'none'}.\nIn two short plain sentences, say whether this looks like a scam and what the person should do.\n\n---\n${text.slice(0, 4000)}`;
  const reply = await session.prompt(prompt);
  session.destroy?.();
  return { reply, source: 'on_device', model: 'gemini-nano' };
}

async function cloudOpinion(text, instant) {
  if (!USE_EXT_CLOUD) return { skipped: true, production: true };
  const { analyze, isConfigured, describeAiError, CLOUD_MODEL } = await import('../src/ai.js');
  if (!isConfigured) return { skipped: true, note: 'Cloud AI is not connected in this build.' };
  try {
    const { data, source, ms, reason, model } = await analyze({ text, localScan: instant, route: 'cloud' });
    return { data, source, ms, reason, model: model || CLOUD_MODEL };
  } catch (e) {
    const info = describeAiError(e);
    return { skipped: true, note: info.message, code: info.code };
  }
}

function openFullCheck(text) {
  const url = buildCheckUrl(SITE_URL, text);
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) chrome.tabs.create({ url });
  else window.open(url, '_blank', 'noopener');
}

async function downloadCard(payload) {
  await document.fonts?.ready.catch(() => {});
  const blob = await canvasToPngBlob(createScamCardCanvas(payload));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cardFileName(payload.verdict);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderPanel(payload, { note, showOpenFull, showCloudNote } = {}) {
  const { verdict, score, summary, flags, todo, scamType, source } = payload;
  const open = showOpenFull
    ? '<button type="button" class="primary" id="openFull">Open full check</button>'
    : '';
  return `<div class="panel res" data-verdict="${esc(verdict)}">
    <div class="result-head">
      ${gaugeHtml(verdict, score)}
      <div class="verdict-copy">
        <h2 class="${esc(verdict)}">${esc(LABEL[verdict] || 'Check result')}</h2>
        <div class="verdict-meta">
          <span>${esc((scamType && scamType !== 'none') ? scamType : 'Risk check')} · ${score}/100</span>
          ${sourceBadgeHtml(source)}
        </div>
      </div>
    </div>
    <p class="summary">${esc(summary)}</p>
    <h3 class="section-label">Why</h3>
    ${chipsHtml(flags)}
    ${todo?.length ? `<h3 class="section-label">What to do</h3><ul class="todo">${todo.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${note ? `<p class="meta">${esc(note)}</p>` : ''}
    ${showCloudNote ? '<p class="meta">This production popup stays on your device. Open the full site if you want a Google cloud check.</p>' : ''}
    <div class="actions">
      <button type="button" class="ghost" id="saveCard">Save warning card</button>
      ${open}
    </div>
  </div>`;
}

async function check(text) {
  if (!text.trim()) return;
  const t0 = performance.now();
  const r = scan(text);
  const ms = Math.round(performance.now() - t0);
  $('engine').textContent = USE_HELPER ? 'Cloud ready' : (USE_EXT_CLOUD ? 'Dev cloud ready' : 'On-device mode');
  $('engine').className = USE_EXT_CLOUD ? 'pill cloud' : 'pill device';

  let payload = {
    verdict: r.verdict,
    score: r.score,
    flags: r.flags,
    scamType: 'Instant scan',
    summary: r.flags.length ? 'Our instant scan found warning signs.' : 'Our instant scan found no obvious warning signs.',
    todo: r.verdict === 'likely_safe'
      ? ['No obvious red flags, but still avoid sharing codes or passwords.']
      : ['Do not click the link or reply.', 'Never share one-time codes, PINs or passwords.', 'Contact the company using its official app or a number you already trust.'],
    source: 'instant',
  };
  let note = `Instant scan ran on this device in ${ms} ms.`;
  let showOpenFull = !USE_EXT_CLOUD;
  let showCloudNote = false;

  try {
    const device = await onDeviceOpinion(text, r).catch(() => ({ skipped: true, note: 'On-device AI could not run.' }));
    if (device && device.reply) {
      payload = {
        ...payload,
        summary: device.reply,
        source: 'on_device',
        scamType: payload.scamType,
      };
      note = 'Ran on your device, nothing was uploaded.';
    } else if (USE_EXT_CLOUD) {
      note = (device && device.note) || 'On-device AI is not available; asking Google cloud.';
      const cloud = await cloudOpinion(text, r);
      if (cloud && cloud.data) {
        const verdict = ['likely_safe', 'suspicious', 'scam'].includes(cloud.data.verdict) ? cloud.data.verdict : r.verdict;
        const score = Math.max(0, Math.min(100, Math.round(Number(cloud.data.risk_score) || r.score)));
        payload = {
          verdict,
          score,
          summary: cloud.data.summary || payload.summary,
          flags: [...new Set([...(cloud.data.red_flags || []), ...r.flags])].slice(0, 8),
          todo: cloud.data.what_to_do || payload.todo,
          scamType: cloud.data.scam_type || 'Cloud check',
          source: cloud.source || 'in_cloud',
        };
        note = `Ran in Google cloud (${cloud.model}) · ${(cloud.ms / 1000).toFixed(1)}s`;
        showOpenFull = false;
        showCloudNote = false;
      } else if (cloud?.note) {
        note = cloud.note;
        showOpenFull = true;
      }
    } else if (device?.note) {
      note = `${device.note} Instant scan shown.`;
    }
  } catch (e) {
    note = 'AI could not finish, so this is the instant scan.';
    console.error(e);
  }

  $('out').innerHTML = renderPanel(payload, { note, showOpenFull, showCloudNote });
  if (prefersReducedMotion()) $('out').querySelector('.gauge-arc')?.style.setProperty('animation', 'none');
  const save = $('saveCard');
  if (save) save.onclick = () => downloadCard(payload);
  const open = $('openFull');
  if (open) open.onclick = () => openFullCheck(text);
  window.__CHECKFIRST_LAST__ = { ok: true, ...payload, note, cloud: USE_EXT_CLOUD, siteUrl: SITE_URL };
}

function paintSamples() {
  const row = $('sampleRow');
  row.innerHTML = SAMPLES.map((s) => `<button type="button" data-sample="${s.id}">${esc(s.label)}</button>`).join('');
  row.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-sample]');
    if (!btn) return;
    const sample = getSample(btn.dataset.sample);
    if (!sample) return;
    $('input').value = sample.text;
    check(sample.text);
  });
}

$('go').addEventListener('click', () => check($('input').value));
paintSamples();

try {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    const { pending } = await chrome.storage.session.get('pending');
    if (pending && Date.now() - pending.at < 60000) {
      await chrome.storage.session.remove('pending');
      $('input').value = pending.input || '';
      check($('input').value);
    }
  }
} catch {
  // Not running as an unpacked extension (for example, during a local page test).
}
