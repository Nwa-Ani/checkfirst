// All model inference goes through Firebase AI Logic hybrid inference.
// On-device (Gemini Nano in Chrome) first, cloud Gemini as fallback.
import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema } from 'firebase/ai';

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
export const isConfigured = Boolean(config.apiKey && config.projectId && config.appId);

// Long inputs and PDFs go straight to the cloud: the on-device model has a small context window
// and does not read PDFs.
export const ON_DEVICE_CHAR_LIMIT = 6000;

// Default cloud fallback is Gemini 3.5 Flash Lite (SDK default for hybrid in-cloud).
export const CLOUD_MODEL = env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite';

const SYSTEM = `You are CheckFirst, a calm safety assistant for everyday people.
You review a message, email, link, web page text or screenshot that a user received and
decide if it is a scam, phishing, or fake page. Be specific and plain-spoken.
Never ask the user for personal data. Give practical next steps. Reply in the same language as the input.`;

const VERDICTS = ['likely_safe', 'suspicious', 'scam'];

const cloudSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({ enum: VERDICTS }),
    risk_score: Schema.integer(),
    scam_type: Schema.string(),
    summary: Schema.string(),
    red_flags: Schema.array({ items: Schema.string() }),
    what_to_do: Schema.array({ items: Schema.string() }),
  },
});

// Plain JSON Schema for Chrome's Prompt API responseConstraint (on-device structured output).
const deviceSchema = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICTS },
    risk_score: { type: 'integer', minimum: 0, maximum: 100 },
    scam_type: { type: 'string' },
    summary: { type: 'string' },
    red_flags: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    what_to_do: { type: 'array', items: { type: 'string' }, maxItems: 4 },
  },
  required: ['verdict', 'risk_score', 'scam_type', 'summary', 'red_flags', 'what_to_do'],
};

const SITE_SYSTEM = `You are CheckFirst, a calm safety assistant for everyday people.
A user asked whether a website looks genuine. Read the URL and the signals already collected
(Google Safe Browsing, the address structure, and domain age if present).
Be specific and plain-spoken. Never ask for personal data.
If Safe Browsing already flagged the address, the verdict must be malicious.
Reply in the same language as the user.`;

const SITE_VERDICTS = ['good', 'cautious', 'risky', 'bad', 'malicious'];

const siteCloudSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({ enum: SITE_VERDICTS }),
    reason: Schema.string(),
    signals: Schema.array({ items: Schema.string() }),
    what_to_do: Schema.array({ items: Schema.string() }),
  },
});

const siteDeviceSchema = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: SITE_VERDICTS },
    reason: { type: 'string' },
    signals: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    what_to_do: { type: 'array', items: { type: 'string' }, maxItems: 4 },
  },
  required: ['verdict', 'reason', 'signals', 'what_to_do'],
};

let models = null;

async function fetchHelperAppCheckToken() {
  const url = env.VITE_APPCHECK_TOKEN_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    const err = new Error('APP_CHECK_TOKEN_HTTP');
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!data?.token || !data?.expireTimeMillis) {
    throw new Error('APP_CHECK_TOKEN_SHAPE');
  }
  return { token: data.token, expireTimeMillis: Number(data.expireTimeMillis) };
}

function initAppCheck(app) {
  const siteKey = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  // Debug token is only present in dev/test builds. Production Vite configs blank
  // VITE_APPCHECK_DEBUG_TOKEN / VITE_APPCHECK_DEBUG so they are not embedded.
  const debugToken = env.VITE_APPCHECK_DEBUG_TOKEN;
  const useDebug = env.VITE_APPCHECK_DEBUG === 'true' && Boolean(debugToken);
  const tokenUrl = env.VITE_APPCHECK_TOKEN_URL;
  const useCustom = Boolean(tokenUrl) && (
    env.VITE_APPCHECK_USE_CUSTOM === 'true'
    || (typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id))
  );
  // Must be set before initializeAppCheck so the SDK exchanges the debug token.
  if (useDebug) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  if (useDebug) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey || 'unused-debug-provider'),
      isTokenAutoRefreshEnabled: true,
    });
    return;
  }
  // Production extension pages cannot run reCAPTCHA, so they mint a token from the helper.
  if (useCustom) {
    initializeAppCheck(app, {
      provider: new CustomProvider({ getToken: fetchHelperAppCheckToken }),
      isTokenAutoRefreshEnabled: true,
    });
    return;
  }
  if (siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
}

function init() {
  if (models || !isConfigured) return models;
  const app = getApps().length ? getApp() : initializeApp(config);
  initAppCheck(app);
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const generationConfig = { responseMimeType: 'application/json', responseSchema: cloudSchema, temperature: 0.2 };
  const inCloudParams = { model: CLOUD_MODEL, systemInstruction: SYSTEM, generationConfig };
  const onDeviceParams = {
    createOptions: { initialPrompts: [{ role: 'system', content: SYSTEM }], expectedInputs: [{ type: 'text' }, { type: 'image' }] },
    promptOptions: { responseConstraint: deviceSchema },
  };
  models = {
    hybrid: getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, onDeviceParams, inCloudParams }),
    privateOnly: getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams, inCloudParams }),
    cloud: getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams }),
  };
  return models;
}

let siteModels = null;

function initSite() {
  if (siteModels || !isConfigured) return siteModels;
  init();
  const app = getApp();
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const generationConfig = { responseMimeType: 'application/json', responseSchema: siteCloudSchema, temperature: 0.2 };
  const inCloudParams = { model: CLOUD_MODEL, systemInstruction: SITE_SYSTEM, generationConfig };
  const onDeviceParams = {
    createOptions: { initialPrompts: [{ role: 'system', content: SITE_SYSTEM }], expectedInputs: [{ type: 'text' }] },
    promptOptions: { responseConstraint: siteDeviceSchema },
  };
  siteModels = {
    hybrid: getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, onDeviceParams, inCloudParams }),
    privateOnly: getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams, inCloudParams }),
    cloud: getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams }),
  };
  return siteModels;
}

// Must be called from a user gesture (Chrome user-activation rule).
export function warmUpDevice(onProgress) {
  const m = init();
  if (!m) return Promise.resolve();
  return Promise.all([m.hybrid.initializeDeviceModel(onProgress), m.privateOnly.initializeDeviceModel()]).catch(() => {});
}

export async function deviceStatus() {
  if (!('LanguageModel' in self)) return 'unavailable';
  try { return await self.LanguageModel.availability(); } catch { return 'unavailable'; }
}

const fileToPart = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ inlineData: { data: String(r.result).split(',')[1], mimeType: file.type } });
  r.onerror = reject;
  r.readAsDataURL(file);
});

export function normalizeSource(source, forcedCloud = false) {
  const s = String(source || '').toLowerCase().replace('-', '_');
  if (s === 'on_device') return 'on_device';
  if (s === 'in_cloud' || s === 'cloud' || forcedCloud) return 'in_cloud';
  return s || 'unknown';
}

/**
 * Turn SDK errors into a clear, user-facing message. App Check 403s must not fail silently.
 */
export function describeAiError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  const status = err?.customErrorData?.status || err?.status;
  const blob = `${code} ${status || ''} ${msg}`;
  if (code === 'API_NOT_ENABLED' || /API_NOT_ENABLED|firebasevertexai\.googleapis\.com.*enabled/i.test(blob)) {
    return {
      code: 'API_NOT_ENABLED',
      message: 'Cloud AI is not enabled yet in this Firebase project. In the Firebase console, open AI Logic and click Get started, then try again.',
    };
  }
  if (status === 403 || /app check|appcheck|attestation|invalid.?token|403/i.test(blob)) {
    return {
      code: 'APP_CHECK',
      message: 'Cloud AI is blocked by App Check. In the Firebase console, go to App Check, then Apps, then Manage debug tokens, and register this computer\'s debug token. After it is saved, run the check again.',
    };
  }
  if (code === 'NOT_CONFIGURED') {
    return { code: 'NOT_CONFIGURED', message: 'AI is not connected yet, showing the instant scan instead.' };
  }
  return { code: 'AI_FAILED', message: 'AI check failed, showing the instant scan instead.' };
}

/**
 * Decide which route to use and run the check.
 * route: 'auto' | 'private' | 'cloud' (second opinion)
 */
export async function analyze({ text, file, localScan, route = 'auto' }) {
  const m = init();
  if (!m) {
    const err = new Error('NOT_CONFIGURED');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const isPdf = file && file.type === 'application/pdf';
  const isLong = (text || '').length > ON_DEVICE_CHAR_LIMIT;
  let model = m.hybrid;
  let reason = 'On-device first, cloud only if this device has no local model';
  let forcedCloud = false;
  if (route === 'private') { model = m.privateOnly; reason = 'Private mode: never leaves this device'; }
  else if (route === 'cloud') { model = m.cloud; reason = 'Second opinion from cloud Gemini'; forcedCloud = true; }
  else if (isPdf || isLong) { model = m.cloud; reason = isPdf ? 'PDFs are read by cloud Gemini' : 'Long content is handed to cloud Gemini'; forcedCloud = true; }
  if (route === 'private' && (isPdf || isLong)) {
    const err = new Error('PRIVATE_TOO_BIG');
    err.code = 'PRIVATE_TOO_BIG';
    throw err;
  }

  const prompt = `Check this for scams.\nLocal scanner signals (may be incomplete): ${JSON.stringify(localScan)}\n\nContent:\n"""${(text || '(see attachment)').slice(0, 30000)}"""\nReturn JSON only.`;
  const parts = [{ text: prompt }];
  if (file) parts.push(await fileToPart(file));
  const t0 = performance.now();
  const result = await model.generateContent(parts);
  const ms = Math.round(performance.now() - t0);
  const raw = result.response.text();
  const data = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
  const source = normalizeSource(result.response.inferenceSource, forcedCloud || model === m.cloud);
  const modelName = source === 'in_cloud' ? (model.model || CLOUD_MODEL) : 'gemini-nano';
  return { data, source, ms, reason, model: modelName };
}

/**
 * Review a website address with the same hybrid routing as message checks.
 * route: 'auto' | 'private' | 'cloud'
 */
export async function analyzeSite({ url, collected, route = 'auto' }) {
  const m = initSite();
  if (!m) {
    const err = new Error('NOT_CONFIGURED');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  let model = m.hybrid;
  let reason = 'On-device first, cloud only if this device has no local model';
  let forcedCloud = false;
  if (route === 'private') { model = m.privateOnly; reason = 'Private mode: never leaves this device'; }
  else if (route === 'cloud') { model = m.cloud; reason = 'Second opinion from cloud Gemini'; forcedCloud = true; }

  const prompt = `Decide if this website looks genuine.
URL: ${url}
Signals already collected (JSON): ${JSON.stringify({
    verdict: collected?.verdict,
    flags: collected?.flags,
    safeBrowsing: collected?.safeBrowsing,
    rdap: collected?.rdap,
    structure: collected?.structure?.signals || collected?.structure?.flags,
  })}
If Safe Browsing reported a match, verdict must be malicious.
Write a short plain-English reason (two sentences at most) and the signals that matter.
Return JSON only.`;
  const t0 = performance.now();
  const result = await model.generateContent([{ text: prompt }]);
  const ms = Math.round(performance.now() - t0);
  const raw = result.response.text();
  const data = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
  const source = normalizeSource(result.response.inferenceSource, forcedCloud || model === m.cloud);
  const modelName = source === 'in_cloud' ? (model.model || CLOUD_MODEL) : 'gemini-nano';
  return { data, source, ms, reason, model: modelName };
}
