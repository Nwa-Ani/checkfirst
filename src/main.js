import { scan } from './heuristics.js';
import { analyze, warmUpDevice, deviceStatus, isConfigured } from './ai.js';

const $ = (id) => document.getElementById(id);
const LABEL = { likely_safe: 'Looks OK', suspicious: 'Be careful', scam: 'Likely scam' };
const COLOR = { likely_safe: 'var(--safe)', suspicious: 'var(--warn)', scam: 'var(--bad)' };
const SAMPLE = `Dear customer, your account has been temporarily suspended due to unusual sign-in activity. Verify your account within 24 hours to avoid permanent closure: http://paypa1-secure-login.top/verify
Enter the one-time code we send you to confirm. Support Team`;
let warmed = false;
let last = null;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function showEngine() {
  const el = $('engine');
  if (!isConfigured) { el.textContent = 'Demo mode: instant scan only'; el.className = 'pill off'; return; }
  const s = await deviceStatus();
  if (s === 'available') { el.textContent = 'On-device AI ready'; el.className = 'pill'; }
  else if (s === 'downloadable' || s === 'downloading') { el.textContent = 'On-device AI can be downloaded, cloud for now'; el.className = 'pill cloud'; }
  else { el.textContent = 'Using cloud AI (no local model here)'; el.className = 'pill cloud'; }
}

function render({ verdict, score, summary, flags, todo, scamType, sourceLine }) {
  const r = $('result');
  r.classList.remove('hidden');
  r.innerHTML = `<div class="res">
    <div class="verdict"><span class="badge ${verdict}">${LABEL[verdict]}</span>
      <div><b>${esc(scamType || 'Risk check')}</b><div class="muted">Risk ${score}/100</div><div class="where muted">${sourceLine}</div></div></div>
    <div class="meter"><i style="width:${score}%;background:${COLOR[verdict]}"></i></div>
    <p>${esc(summary)}</p>
    ${flags.length ? `<h3>Red flags</h3><ul>${flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${todo.length ? `<h3>What to do</h3><ul>${todo.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    <div class="actions">
      ${isConfigured ? '<button id="second">Get a second opinion (cloud)</button>' : ''}
      <button id="warn">Copy a warning for friends</button>
    </div></div>`;
  $('warn').onclick = () => {
    const msg = `Heads up: I checked a message with CheckFirst and it came back "${LABEL[verdict]}" (${score}/100). ${flags.slice(0, 3).join('. ')}. Don't click links or share codes.`;
    navigator.clipboard?.writeText(msg);
    $('warn').textContent = 'Copied';
  };
  if ($('second')) $('second').onclick = () => run('cloud');
}

function localOnly(local, note) {
  const todo = local.verdict === 'likely_safe'
    ? ['No obvious red flags, but still avoid sharing codes or passwords.']
    : ['Do not click the link or reply.', 'Never share one-time codes, PINs or passwords.', 'Contact the company using its official app or a number you already trust.'];
  render({ verdict: local.verdict, score: local.score, scamType: 'Instant scan', flags: local.flags,
    summary: local.flags.length ? 'Our instant scan found warning signs.' : 'Our instant scan found no obvious warning signs.', todo, sourceLine: note });
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
  last = { text, file, local };
  if (!isConfigured) { localOnly(local, 'Ran entirely on this device (demo mode, AI not connected yet)'); saveHistory(text, local.verdict, local.score); return; }
  if (!warmed) { warmed = true; warmUpDevice((p) => { $('progress').textContent = `Downloading on-device model ${Math.round(p * 100)}%`; }); }
  const priv = $('private').checked;
  const btn = $('check'); btn.disabled = true;
  $('progress').textContent = route === 'cloud' ? 'Asking cloud Gemini for a second opinion…' : 'Checking…';
  try {
    const { data, source, ms, reason } = await analyze({ text, file, localScan: local, route: route || (priv ? 'private' : 'auto') });
    const verdict = ['likely_safe', 'suspicious', 'scam'].includes(data.verdict) ? data.verdict : local.verdict;
    const score = Math.max(0, Math.min(100, Math.round(Number(data.risk_score) || local.score)));
    const flags = [...new Set([...(data.red_flags || []), ...local.flags])].slice(0, 8);
    const where = source === 'on_device' ? 'Ran on your device, nothing was uploaded' : 'Ran in the cloud with Gemini';
    render({ verdict, score, summary: data.summary, flags, todo: data.what_to_do || [], scamType: data.scam_type, sourceLine: `${where} · ${(ms / 1000).toFixed(1)}s · ${reason}` });
    saveHistory(text, verdict, score);
    $('progress').textContent = '';
  } catch (e) {
    const msg = e.message === 'PRIVATE_TOO_BIG' ? 'Private mode only handles short text and screenshots. Turn it off to use cloud for PDFs or long emails.'
      : 'AI check failed, showing the instant scan instead.';
    localOnly(local, 'Instant scan on this device');
    $('progress').textContent = msg;
    console.error(e);
  } finally { btn.disabled = false; }
}

$('check').onclick = () => run();
$('sample').onclick = () => { $('input').value = SAMPLE; run(); };
$('file').onchange = () => { const f = $('file').files[0]; $('fileLabel').textContent = f ? `Attached: ${f.name}` : '+ Add screenshot or PDF'; };
showEngine();
drawHistory();
