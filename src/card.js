import { PALETTE, LABEL, sourceLabel } from './theme.js';

const W = 900;
const H = 1140;

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function verdictColor(verdict) {
  if (verdict === 'likely_safe' || verdict === 'good') return PALETTE.safe;
  if (verdict === 'suspicious' || verdict === 'cautious') return PALETTE.caution;
  if (verdict === 'risky') return PALETTE.risky || '#FF8A4C';
  if (verdict === 'malicious') return PALETTE.malicious || '#FF2D55';
  return PALETTE.scam;
}

function drawShield(ctx, cx, cy, size, fill) {
  const s = size / 64;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-32, -32);
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(56, 13);
  ctx.lineTo(56, 32);
  ctx.bezierCurveTo(56, 46, 45, 56, 32, 60);
  ctx.bezierCurveTo(19, 56, 8, 46, 8, 32);
  ctx.lineTo(8, 13);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

export function drawScamCard(ctx, {
  verdict = 'scam',
  score = 0,
  summary = '',
  flags = [],
  scamType = '',
  source = 'instant',
} = {}) {
  const color = verdictColor(verdict);
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.7, 80, 20, W * 0.7, 80, 420);
  glow.addColorStop(0, `${color}33`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 2;
  roundRect(ctx, 36, 36, W - 72, H - 72, 36);
  ctx.stroke();

  ctx.fillStyle = PALETTE.brand;
  ctx.font = '700 28px Outfit, Inter, system-ui, sans-serif';
  ctx.fillText('CheckFirst', 80, 110);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 18px Outfit, Inter, system-ui, sans-serif';
  ctx.fillText('Paste it before you click it', 80, 140);

  drawShield(ctx, 790, 112, 72, PALETTE.brand);

  ctx.fillStyle = color;
  ctx.font = '800 72px Syne, Outfit, system-ui, sans-serif';
  const title = LABEL[verdict] || 'Check result';
  const titleLines = wrapText(ctx, title, W - 160);
  let y = 250;
  for (const line of titleLines) {
    ctx.fillText(line, 80, y);
    y += 82;
  }

  ctx.fillStyle = PALETTE.ivory;
  ctx.font = '600 28px Outfit, Inter, system-ui, sans-serif';
  const isSite = ['good', 'cautious', 'risky', 'bad', 'malicious'].includes(verdict);
  const type = scamType && scamType !== 'none' ? scamType : (isSite ? 'Website check' : 'Risk check');
  ctx.fillText(isSite ? type : `${type}  ·  Risk ${Math.round(score)}/100`, 80, y + 10);
  y += 70;

  if (!isSite) {
    const barX = 80, barY = y, barW = W - 160, barH = 18;
    ctx.fillStyle = 'rgba(243,238,228,0.08)';
    roundRect(ctx, barX, barY, barW, barH, 9);
    ctx.fill();
    ctx.fillStyle = color;
    const filled = Math.max(8, (barW * Math.max(0, Math.min(100, score))) / 100);
    roundRect(ctx, barX, barY, filled, barH, 9);
    ctx.fill();
    y += 70;
  }

  ctx.fillStyle = PALETTE.muted;
  ctx.font = '600 16px Outfit, Inter, system-ui, sans-serif';
  ctx.fillText('WHY', 80, y);
  y += 28;

  const footerTop = H - 186;
  const summaryTop = footerTop - 150;
  const chips = (flags || []).slice(0, 4);
  ctx.font = '500 22px Outfit, Inter, system-ui, sans-serif';
  if (!chips.length) {
    ctx.fillStyle = PALETTE.ivory;
    ctx.fillText('No obvious warning signs in the instant scan.', 80, y + 20);
    y += 56;
  } else {
    for (const flag of chips) {
      const lines = wrapText(ctx, flag, W - 220);
      const h = Math.max(56, 28 + lines.length * 28);
      if (y + h > summaryTop - 12) break;
      ctx.fillStyle = 'rgba(243,238,228,0.06)';
      ctx.strokeStyle = `${color}66`;
      ctx.lineWidth = 1.5;
      roundRect(ctx, 80, y, W - 160, h, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.ivory;
      let ly = y + 34;
      for (const line of lines) {
        ctx.fillText(line, 104, ly);
        ly += 28;
      }
      y += h + 12;
    }
  }

  ctx.font = '500 24px Outfit, Inter, system-ui, sans-serif';
  const summaryLines = wrapText(ctx, summary || 'I checked a message with CheckFirst. Be careful with links and codes.', W - 160).slice(0, 4);
  let sy = summaryTop + 24;
  ctx.fillStyle = PALETTE.ivory;
  for (const line of summaryLines) {
    ctx.fillText(line, 80, sy);
    sy += 32;
  }

  const src = sourceLabel(source);
  ctx.font = '700 22px Outfit, Inter, system-ui, sans-serif';
  const badgeW = Math.ceil(ctx.measureText(src).width) + 56;
  ctx.fillStyle = 'rgba(243,238,228,0.08)';
  roundRect(ctx, 80, footerTop, badgeW, 56, 28);
  ctx.fill();
  ctx.fillStyle = src === 'Google cloud' ? PALETTE.cloud : PALETTE.device;
  ctx.fillText(src, 108, footerTop + 36);

  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 18px Outfit, Inter, system-ui, sans-serif';
  ctx.fillText('Guidance only. Contact the company on a number or site you already trust.', 80, H - 62);
}

export function createScamCardCanvas(data) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawScamCard(ctx, data);
  return canvas;
}

export function cardFileName(verdict) {
  return `checkfirst-${verdict || 'warning'}.png`;
}

export async function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('card-blob-failed'))), 'image/png');
  });
}
