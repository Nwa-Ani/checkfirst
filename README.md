# CheckFirst

**Paste it before you click it.** A hybrid AI scam and fake-page checker for everyday people, built for #BuildHybridAI 2026 with Firebase AI Logic.

## The problem
Phishing texts, fake delivery notices, job scams and look-alike login pages hit billions of people. The messages people most need checked are private (bank alerts, family chats, inbox screenshots), so sending them to a cloud AI feels wrong, and many people are on slow or expensive data.

## How CheckFirst uses hybrid inference
| Step | Where it runs | Why |
| --- | --- | --- |
| Instant scan (look-alike domains, shorteners, raw IPs, urgency, requests for codes) | In the browser, no AI | Zero latency, works offline, feeds signals to the model |
| AI verdict on text or a screenshot (JPEG/PNG) | **On-device** Gemini Nano via Firebase AI Logic `PREFER_ON_DEVICE` | Private messages never leave the device, free, fast |
| Same check on devices without a local model (phones, older laptops) | **Cloud** Gemini (automatic fallback) | Everyone gets the feature |
| Long emails and PDFs | Cloud (`ONLY_IN_CLOUD`) | Beyond on-device context and input types |
| Private mode | `ONLY_ON_DEVICE` | User guarantee: nothing is uploaded |
| "Second opinion" | Cloud (`ONLY_IN_CLOUD`) | User-chosen escalation for borderline cases |

Every result shows where it ran (from `response.inferenceSource`), how long it took, and why that route was chosen. Structured output (JSON schema) is used on both paths so the UI is identical.

All model calls go through Firebase AI Logic (`firebase/ai`); see `src/ai.js`. App Check is initialised (debug provider locally, reCAPTCHA Enterprise when hosted).

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in your Firebase web app config (never commit it)
npm run dev                  # http://localhost:5173
npm test                     # heuristic scanner tests
```
With no `.env.local`, the app runs in **demo mode** (instant scan only), which is useful for UI work.

### Enable on-device AI in Chrome (desktop, v139+)
1. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` set to **Enabled**, restart Chrome.
2. In DevTools console: `await LanguageModel.availability()` should return `available`, `downloadable` or `downloading`. If `downloadable`, run `await LanguageModel.create()` once to download.

## Project layout
- `src/heuristics.js`: offline red-flag scanner for messages
- `src/url-signals.js`: website address signals and the five-way verdict
- `src/site-check.js`: talks to the helper for Safe Browsing and RDAP
- `src/ai.js`: Firebase AI Logic setup, hybrid routing, structured output
- `src/main.js`: UI flow, Message and Website modes, history (stored only in this browser)
- `server/`: App Check helper plus `POST /url-check` for Safe Browsing
- `test/`: scanner, website verdict and helper tests

## Roadmap (hackathon window)
- Chrome extension: right-click any link or page and "Check with CheckFirst"
- Android build with the same hybrid SDK (multi-platform bonus)
- Remote Config to tune risk thresholds and route rules without redeploying

## Website checks and Safe Browsing

The website mode can call Google Safe Browsing Lookup API v4 through the helper so the API key stays on the server. To turn that on after this branch is deployed:

1. In Google Cloud, open project `checkfirst-a0db3`.
2. Enable the **Safe Browsing API** (`safebrowsing.googleapis.com`).
3. Create an API key under APIs & Services, then Credentials. Restrict that key to the Safe Browsing API.
4. Add the key as `SAFE_BROWSING_API_KEY` on the Render service `checkfirst-appcheck`, then redeploy the helper.
5. Do not put the key in the website build, the repo, or chat.

Without the key, website checks still run from the address structure and hybrid AI. Official Safe Browsing test pages only come back **Malicious** once the key is in place.

## License
Apache-2.0
