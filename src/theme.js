export const PALETTE = {
  bg: '#080A0F',
  surface: '#141824',
  ivory: '#F3EEE4',
  muted: '#9BA3B4',
  brand: '#F2C14E',
  safe: '#2FD0C6',
  caution: '#F2C14E',
  risky: '#FF8A4C',
  scam: '#FF5D73',
  malicious: '#FF2D55',
  cloud: '#8BB4FF',
  device: '#2FD0C6',
  line: 'rgba(243, 238, 228, 0.12)',
};

export const LABEL = {
  likely_safe: 'Looks clear',
  suspicious: 'Be careful',
  scam: 'Likely scam',
  good: 'Good',
  cautious: 'Cautious',
  risky: 'Risky',
  bad: 'Bad',
  malicious: 'Malicious',
};

export const SOURCE_KIND = {
  on_device: 'device',
  instant: 'device',
  in_cloud: 'cloud',
};

export function sourceKind(source) {
  return SOURCE_KIND[source] === 'cloud' ? 'cloud' : 'device';
}

export function sourceLabel(source) {
  return sourceKind(source) === 'cloud' ? 'Google cloud' : 'On your device';
}

export function prefersReducedMotion() {
  return Boolean(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
