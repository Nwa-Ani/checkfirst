// All model inference goes through Firebase AI Logic hybrid inference.
// On-device (Gemini Nano in Chrome) first, cloud Gemini as fallback.
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
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

let models = null;

function init() {
  if (models || !isConfigured) return models;
  const app = initializeApp(config);
  if (env.VITE_APPCHECK_DEBUG === 'true') self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  if (env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || env.VITE_APPCHECK_DEBUG === 'true') {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || 'debug'),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const generationConfig = { responseMimeType: 'application/json', responseSchema: cloudSchema, temperature: 0.2 };
  const inCloudParams = { systemInstruction: SYSTEM, generationConfig, ...(env.VITE_CLOUD_MODEL ? { model: env.VITE_CLOUD_MODEL } : {}) };
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

/**
 * Decide which route to use and run the check.
 * route: 'auto' | 'private' | 'cloud' (second opinion)
 */
export async function analyze({ text, file, localScan, route = 'auto' }) {
  const m = init();
  if (!m) throw new Error('NOT_CONFIGURED');
  const isPdf = file && file.type === 'application/pdf';
  const isLong = (text || '').length > ON_DEVICE_CHAR_LIMIT;
  let model = m.hybrid;
  let reason = 'On-device first, cloud only if this device has no local model';
  if (route === 'private') { model = m.privateOnly; reason = 'Private mode: never leaves this device'; }
  else if (route === 'cloud') { model = m.cloud; reason = 'Second opinion from cloud Gemini'; }
  else if (isPdf || isLong) { model = m.cloud; reason = isPdf ? 'PDFs are read by cloud Gemini' : 'Long content is handed to cloud Gemini'; }
  if (route === 'private' && (isPdf || isLong)) throw new Error('PRIVATE_TOO_BIG');

  const prompt = `Check this for scams.\nLocal scanner signals (may be incomplete): ${JSON.stringify(localScan)}\n\nContent:\n"""${(text || '(see attachment)').slice(0, 30000)}"""\nReturn JSON only.`;
  const parts = [{ text: prompt }];
  if (file) parts.push(await fileToPart(file));
  const t0 = performance.now();
  const result = await model.generateContent(parts);
  const ms = Math.round(performance.now() - t0);
  const raw = result.response.text();
  const data = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
  return { data, source: result.response.inferenceSource || (model === m.cloud ? 'in_cloud' : 'unknown'), ms, reason };
}
