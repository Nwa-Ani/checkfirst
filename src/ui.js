import { LABEL, sourceKind, sourceLabel } from './theme.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const CIRC = 2 * Math.PI * 52;

export function gaugeHtml(verdict, score) {
  const safe = Math.max(0, Math.min(100, Number(score) || 0));
  const offset = CIRC * (1 - safe / 100);
  const title = LABEL[verdict] || 'Check result';
  return `<div class="gauge" data-verdict="${esc(verdict)}" style="--score:${safe};--circ:${CIRC.toFixed(2)};--offset:${offset.toFixed(2)}">
    <svg viewBox="0 0 120 120" role="img" aria-label="${esc(title)}, risk ${safe} out of 100">
      <circle class="gauge-track" cx="60" cy="60" r="52"></circle>
      <circle class="gauge-arc" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - safe}"></circle>
      <path class="gauge-shield" d="M60 22l22 8v18c0 14-9 24.5-22 28-13-3.5-22-14-22-28V30l22-8z"></path>
      <path class="gauge-mark" d="M50 59l7 7 14-14" fill="none"></path>
    </svg>
    <div class="gauge-score"><b>${safe}</b><span>risk</span></div>
  </div>`;
}

export function chipsHtml(flags) {
  if (!flags?.length) return '<p class="empty-why">No obvious warning signs in the instant scan.</p>';
  return `<ul class="chips">${flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
}

export function siteMarkHtml(verdict, host) {
  const title = LABEL[verdict] || 'Check result';
  const safeHost = host ? `, ${host}` : '';
  return `<div class="site-mark" data-verdict="${esc(verdict)}">
    <svg viewBox="0 0 120 120" role="img" aria-label="${esc(title)}${esc(safeHost)}">
      <path class="gauge-shield" d="M60 22l22 8v18c0 14-9 24.5-22 28-13-3.5-22-14-22-28V30l22-8z"></path>
      <path class="gauge-mark" d="M50 59l7 7 14-14" fill="none"></path>
    </svg>
  </div>`;
}

export function sourceBadgeHtml(source) {
  const kind = sourceKind(source);
  const label = sourceLabel(source);
  return `<span class="source-badge source-${kind}" data-source="${esc(kind)}">${esc(label)}</span>`;
}

export function actionsHtml({ showSecond = false, showOpenFull = false, showCard = true } = {}) {
  return `<div class="actions">
    ${showCard ? '<button type="button" class="ghost" id="saveCard">Save warning card</button>' : ''}
    ${showCard ? '<button type="button" class="ghost" id="shareCard">Share warning</button>' : ''}
    ${showSecond ? '<button type="button" class="ghost" id="second">Second opinion on Google cloud</button>' : ''}
    ${showOpenFull ? '<button type="button" class="primary" id="openFull">Open full check</button>' : ''}
  </div>`;
}

export { esc, LABEL };
