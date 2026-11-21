import { scan } from './heuristics.js';
import { analyze, warmUpDevice, deviceStatus, isConfigured, describeAiError, CLOUD_MODEL } from './ai.js';
import { SAMPLES, getSample } from './samples.js';
import { parseCheckHash } from './hash.js';
import { LABEL, sourceLabel, prefersReducedMotion } from './theme.js';
import { gaugeHtml, chipsHtml, sourceBadgeHtml, esc } from './ui.js';
import { createScamCardCanvas, canvasToPngBlob, cardFileName } from './card.js';

const $ = (id) => document.getElementById(id);
let warmed = false;
let lastResult = null;

function sourceLine({ source, ms, reason, model }) {
  const where = sourceLabel(source);
  const extra = source === 'in_cloud'
    ? ` · ${model || CLOUD_MODEL}`
    : (source === 'on_device' ? ', nothing was uploaded' : '');
  const time = typeof ms === 'number' ? ` · ${(ms / 1000).toFixed(1)}s` : '';
  return `${where}${extra}${time}${reason ? ` · ${reason}` : ''}`;
}

async function showEngine() {
  const el = $('engine');
  if (!isConfigured) { el.textContent = 'Instant scan only'; el.className = 'pill off'; return; }
  const s = await deviceStatus();
  if (s === 'available') { el.textContent = 'On-device AI ready'; el.className = 'pill device'; }
  else if (s === 'downloadable' || s === 'downloading') { el.textContent = 'Cloud ready, on-device can download'; el.className = 'pill cloud'; }
  else { el.textContent = 'Google cloud ready'; el.className = 'pill cloud'; }
}

function bindCardActions(payload) {
  lastResult = payload;
  const save = $('saveCard');
  const share = $('shareCard');
  if (save) save.onclick = () => downloadCard(payload);
  if (share) share.onclick = () => shareCard(payload);
  if ($('second')) $('second').onclick = () => run('cloud');
}

async function buildCardBlob(payload) {
  await document.fonts?.ready.catch(() => {});
  const canvas = createScamCardCanvas(payload);
  return canvasToPngBlob(canvas);
}

async function downloadCard(payload) {
  const blob = await buildCardBlob(payload);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cardFileName(payload.verdict);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  if ($('saveCard')) $('saveCard').textContent = 'Card saved';
}

async function shareCard(payload) {
  const text = `Heads up: I checked a message with CheckFirst and it came back "${LABEL[payload.verdict]}" (${payload.score}/100). ${(payload.flags || []).slice(0, 3).join('. ')}. Don't click links or share codes.`;
  try {
    const blob = await buildCardBlob(payload);
    const file = new File([blob], cardFileName(payload.verdict), { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'CheckFirst warning', text, files: [file] });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: 'CheckFirst warning', text });
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
  }
  await navigator.clipboard?.writeText(text);
  if ($('shareCard')) $('shareCard').textContent = 'Warning copied';
}

function render(payload) {
  const { verdict, score, summary, flags, todo, scamType, source, sourceLine: line } = payload;
  const r = $('result');
  r.classList.remove('hidden');
  r.dataset.source = source || '';
  r.dataset.verdict = verdict || '';
  r.innerHTML = `<div class="res" data-verdict="${esc(verdict)}">
    <div class="result-head">
      ${gaugeHtml(verdict, score)}
      <div class="verdict-copy">
        <h2 class="${esc(verdict)}">${esc(LABEL[verdict] || 'Check result')}</h2>
        <div class="verdict-meta">
          <span>${esc((scamType && scamType !== 'none') ? scamType : 'Risk check')} · ${score}/100</span>
          ${sourceBadgeHtml(source)}
        </div>
        <div class="where muted">${esc(line || '')}</div>
      </div>
    </div>
    <p class="summary">${esc(summary)}</p>
    <h3 class="section-label">Why</h3>
    ${chipsHtml(flags)}
    ${todo?.length ? `<h3 class="section-label">What to do</h3><ul class="todo">${todo.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    <div class="actions">
      <button type="button" class="ghost" id="saveCard">Save warning card</button>
      <button type="button" class="ghost" id="shareCard">Share warning</button>
      ${isConfigured ? '<button type="button" class="ghost" id="second">Second opinion on Google cloud</button>' : ''}
    </div>
  </div>`;
  if (prefersReducedMotion()) r.querySelector('.gauge-arc')?.style.setProperty('animation', 'none');
  bindCardActions(payload);
  r.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
}

function localOnly(local, note) {
  const todo = local.verdict === 'likely_safe'
    ? ['No obvious red flags, but still avoid sharing codes or passwords.']
    : ['Do not click the link or reply.', 'Never share one-time codes, PINs or passwords.', 'Contact the company using its official app or a number you already trust.'];
  render({
    verdict: local.verdict,
    score: local.score,
    scamType: 'Instant scan',
    flags: local.flags,
    summary: local.flags.length ? 'Our instant scan found warning signs.' : 'Our instant scan found no obvious warning signs.',
    todo,
    sourceLine: note,
    source: 'instant',
  });
}

function saveHistory(text, verdict, score) {
  const h = JSON.parse(localStorage.getItem('cf_history') || '[]');
  h.unshift({ t: Date.now(), snippet: text.slice(0, 70) || '(attachment)', verdict, score });
  localStorage.setItem('cf_history', JSON.stringify(h.slice(0, 8)));
  drawHistory();
}
function drawHistory() {
  const h = JSON.parse(localStorage.getItem('cf_history') || '[]');
  $('historyWrap').classList.toggle('hidden', !h.length);
  $('history').innerHTML = h.map((x) => `<li><span>${esc(x.snippet)}</span><span class="dot ${x.verdict}">${LABEL[x.verdict]} ${x.score}</span></li>`).join('');
}

async function run(route) {
  const text = $('input').value.trim();
  const file = $('file').files[0];
  if (!text && !file) { $('progress').textContent = 'Paste something or add a screenshot first.'; return; }
  const local = scan(text);
  if (!isConfigured) { localOnly(local, 'Ran entirely on this device (demo mode, AI not connected yet)'); saveHistory(text, local.verdict, local.score); return; }
  if (!warmed) { warmed = true; warmUpDevice((p) => { $('progress').textContent = `Downloading on-device model ${Math.round(p * 100)}%`; }); }
  const priv = $('private').checked;
  const btn = $('check'); btn.disabled = true;
  $('progress').textContent = route === 'cloud' ? 'Asking Google cloud for a second opinion.' : 'Checking now.';
  try {
    const { data, source, ms, reason, model } = await analyze({ text, file, localScan: local, route: route || (priv ? 'private' : 'auto') });
    const verdict = ['likely_safe', 'suspicious', 'scam'].includes(data.verdict) ? data.verdict : local.verdict;
    const score = Math.max(0, Math.min(100, Math.round(Number(data.risk_score) || local.score)));
    const flags = [...new Set([...(data.red_flags || []), ...local.flags])].slice(0, 8);
    const payload = {
      verdict,
      score,
      summary: data.summary,
      flags,
      todo: data.what_to_do || [],
      scamType: data.scam_type,
      sourceLine: sourceLine({ source, ms, reason, model }),
      source,
    };
    render(payload);
    saveHistory(text, verdict, score);
    $('progress').textContent = '';
    window.__CHECKFIRST_LAST__ = { ok: true, verdict, score, summary: data.summary, flags, source, model, ms, reason, scamType: data.scam_type };
  } catch (e) {
    if (e.message === 'PRIVATE_TOO_BIG' || e.code === 'PRIVATE_TOO_BIG') {
      localOnly(local, 'Instant scan on this device');
      $('progress').textContent = 'Private mode only handles short text and screenshots. Turn it off to use cloud for PDFs or long emails.';
    } else {
      const info = describeAiError(e);
      localOnly(local, 'Instant scan on this device');
      $('progress').textContent = info.message;
      window.__CHECKFIRST_LAST__ = { ok: false, code: info.code, message: info.message, error: String(e?.message || e) };
    }
    console.error(e);
  } finally { btn.disabled = false; }
}

function paintSamples() {
  const row = $('sampleRow');
  row.innerHTML = SAMPLES.map((s) => `<button type="button" data-sample="${s.id}">${esc(s.label)}</button>`).join('');
  row.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-sample]');
    if (!btn) return;
    const sample = getSample(btn.dataset.sample);
    if (!sample) return;
    for (const b of row.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
    $('input').value = sample.text;
    run();
  });
}

function bootFromHash() {
  const text = parseCheckHash(location.hash);
  if (!text) return;
  $('input').value = text;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  run();
}

$('check').onclick = () => run();
$('file').onchange = () => { const f = $('file').files[0]; $('fileLabel').textContent = f ? `Attached: ${f.name}` : 'Add a screenshot or PDF'; };
paintSamples();
showEngine();
drawHistory();
bootFromHash();
window.addEventListener('hashchange', bootFromHash);

window.__CHECKFIRST_CARD__ = async () => {
  if (!lastResult) return null;
  const blob = await buildCardBlob(lastResult);
  return blob;
};
