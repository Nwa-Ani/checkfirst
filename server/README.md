# CheckFirst App Check helper

Mints short-lived Firebase App Check tokens so the **production** Chrome extension can use cloud Gemini. reCAPTCHA Enterprise cannot run in extension pages, so the popup calls `POST /appcheck-token` and uses a Firebase `CustomProvider`.

Stable extension ID (pinned by the public `key` in `extension/manifest.json`):

```
aahdbhdmlfblabbdhoffijbkndlenjcf
```

Allowed request origins are `chrome-extension://aahdbhdmlfblabbdhoffijbkndlenjcf` plus the site origins in `ALLOWED_ORIGINS` (default `http://127.0.0.1:5173` and `http://localhost:5173`). Requests without an allowed `Origin` are rejected.

## Local run

```bash
# FIREBASE_SERVICE_ACCOUNT_JSON must already be in the environment. Do not write it to a file.
npm install
npm start
```

The server listens on port 8787 (or `PORT`). Check `GET /health`, then build the production extension with:

```bash
VITE_APPCHECK_TOKEN_URL=http://127.0.0.1:8787/appcheck-token npm run build:ext
```

Load `dist-extension/` as an unpacked extension. The ID should be `aahdbhdmlfblabbdhoffijbkndlenjcf`.

## Deploy on Render (not done in this pass)

1. Create a Web Service from this repo's `render.yaml` (root directory of the CheckFirst project).
2. In the Render dashboard, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the service account JSON (sync is off in the Blueprint on purpose).
3. Set `ALLOWED_ORIGINS` to the hosted CheckFirst site origin, for example `https://your-site.onrender.com`.
4. Confirm `EXTENSION_ID` is `aahdbhdmlfblabbdhoffijbkndlenjcf`.
5. After the service has a public HTTPS URL, rebuild the extension with `VITE_APPCHECK_TOKEN_URL=https://<service>/appcheck-token` and `VITE_PUBLIC_SITE_URL` set to the hosted site, then load or ship that `dist-extension` build.

The service account can mint App Check tokens for the web app. Treat it as a secret, never commit it, and keep rate limits plus origin checks enabled.

## Website checks (`POST /url-check`)

The same origin allowlist and per-IP rate limit protect this route. The body is `{ "url": "https://example.com" }`. The helper calls Google Safe Browsing Lookup API v4 with `SAFE_BROWSING_API_KEY` and, when it can, looks up domain age on RDAP (no key needed). The key never leaves the server. If the key is missing, the response still succeeds and sets `safeBrowsing.configured` to `false`.
