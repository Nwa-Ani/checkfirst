# CheckFirst - Devpost draft and demo script (DRAFT, not submitted)

Deadline: Nov 30, 2026, 11 PM WAT. Fill the [brackets] once the cloud fallback is wired and hosted.

## Devpost fields

**Tagline:** Paste it before you click it. A hybrid AI scam checker that works on your device, even offline.

**Inspiration:** Fake bank alerts, "your parcel is held" texts and job-offer scams land in everyone's inbox and chats. The messages people most need checked are private, and many people are on slow or expensive data, so a cloud-only checker is the wrong shape. [Add Evo's own story here: a real scam message he or someone close got, with the details.]

**What it does:** Paste a link, message, invoice or screenshot (or right-click anything in Chrome) and get a verdict in plain English: scam risk score, the red flags found, and what to do next. Every result shows where the AI ran (on your device or in the cloud) and why.

**How we built it (hybrid inference):**
- Instant offline scan in the browser (look-alike domains, link shorteners, raw IPs, urgency, requests for codes or PINs).
- On-device Gemini Nano through Firebase AI Logic (`PREFER_ON_DEVICE`) for private messages and screenshots.
- Automatic fallback to cloud Gemini on phones and older laptops, so everyone gets the feature.
- Cloud-only for long emails and PDFs, and a user-chosen "Second opinion".
- Private mode (`ONLY_ON_DEVICE`) guarantees nothing is uploaded.
- Same JSON schema on both paths, so the UI is identical. App Check is on.
- Chrome extension: right-click a link, selected text or the page and pick "Check with CheckFirst".

**Challenges:** Making both inference paths return identical structured output; keeping the extension useful when no local model is present.

**Accomplishments:** Works offline. Private messages never leave the device. [Test result numbers from the final run.]

**What's next:** Android build on the same SDK, Remote Config for risk thresholds, more languages (Pidgin, Yoruba, Hausa, Igbo).

**Built with:** Firebase AI Logic, Gemini, Gemini Nano, Chrome Prompt API, Firebase Hosting, App Check, JavaScript, Vite.

## 3-minute demo script

0:00-0:20 Hook. Show a real-looking "PayPal account locked, send the code we texted you" message on a phone. "Would your mum click this?"
0:20-0:50 Paste it into CheckFirst. Instant scan flags the look-alike domain and the code request. Badge shows "On device".
0:50-1:20 Turn on airplane mode. Check another scam text. Still works. This is the "oh nice" moment.
1:20-1:50 Open on a phone or a browser with no local model. Same check, badge shows "Cloud (fallback)". Explain the route rule on screen.
1:50-2:20 Chrome extension: right-click a suspicious link on a web page, "Check with CheckFirst", verdict pops up.
2:20-2:40 Private mode and "Second opinion" buttons, one sentence each.
2:40-3:00 Close: who it helps, everyone who uses Google, and the tagline.
