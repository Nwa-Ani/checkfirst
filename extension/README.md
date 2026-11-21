# CheckFirst Chrome extension

Right-click a link, selected text or the page and choose "Check ... with CheckFirst". A small window shows the instant on-device scan, then a plain-English opinion from Chrome's built-in Gemini Nano when it is available, or from cloud Gemini if it is not. The Firebase SDK is bundled into the build; no remote scripts are loaded.

For local testing (includes the App Check debug token; do not ship this build):

```bash
npm run build:ext:dev
```

For a production-style bundle with the debug token stripped:

```bash
npm run build:ext
```

Then load it: open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick the `dist-extension/` folder. Do not load the `extension/` source folder; it is not a complete unpacked extension after the cloud fallback was added.

`src/heuristics.js` and `src/ai.js` are the source of truth. The build bundles them with Firebase into `dist-extension/` (gitignored, because the build contains the Firebase web config).

## App Check and the cloud fallback

reCAPTCHA Enterprise cannot run inside Chrome extension pages. The production popup still prefers on-device AI, then falls back to cloud Gemini using a short-lived App Check token from the helper in `server/`.

The extension ID is pinned by the public `key` in `manifest.json` and is:

```
aahdbhdmlfblabbdhoffijbkndlenjcf
```

- Local helper test: run the server in `server/`, set `VITE_APPCHECK_TOKEN_URL=http://127.0.0.1:8787/appcheck-token`, then `npm run build:ext` and load `dist-extension/`. The ID should match the value above. This production-style build must not contain the App Check debug token.
- Dev debug-token build: `npm run build:ext:dev` still uses the debug token and should not be shipped.
- "Open full check" remains available and sends the text to the site in the URL fragment (`#check=...`) if you want to run the same check in the full page.

The site uses reCAPTCHA Enterprise (Fraud Defense) in production and the debug token only in the Vite dev server.
