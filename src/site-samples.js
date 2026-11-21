export const SITE_SAMPLES = [
  {
    id: 'google',
    label: 'Google',
    url: 'https://www.google.com',
  },
  {
    id: 'paypal-lookalike',
    label: 'Fake PayPal login',
    url: 'http://paypa1-secure-login.top/verify',
  },
  {
    id: 'brand-sub',
    label: 'Brand in a subdomain',
    url: 'https://paypal.secure-account.xyz/login',
  },
  {
    id: 'redirect',
    label: 'Hidden redirect',
    url: 'https://help-desk.top/go?url=https://paypa1-secure-login.top/verify',
  },
  {
    id: 'sb-malware',
    label: 'Safe Browsing test',
    url: 'http://testsafebrowsing.appspot.com/s/malware.html',
  },
];

export function getSiteSample(id) {
  return SITE_SAMPLES.find((s) => s.id === id) || null;
}
