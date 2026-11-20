# CheckFirst Chrome extension

Right-click a link, selected text or the page and choose "Check ... with CheckFirst". A small window shows the instant on-device scan, then a plain-English opinion from Chrome's built-in Gemini Nano when it is available. Nothing is uploaded.

Load it: open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick this `extension/` folder.

`heuristics.js` is copied from `src/heuristics.js` by `npm run build:ext`; edit the one in `src/`.
