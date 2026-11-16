# CheckFirst setup checklist (for Evo)

Deadline: Mon Nov 30, 2026, 11:00 PM WAT (2:00 PM PST).

1. Devpost: register for #BuildHybridAI at https://firebasehybridaihackathon.devpost.com/ (Nigeria is eligible).
2. Firebase: create a project at console.firebase.google.com (free Spark plan is fine). Use a burner/project Google account if you prefer.
3. AI Services > AI Logic > Get started > choose **Gemini Developer API** (free tier). This auto-enforces App Check.
4. Register a **Web app** and copy its config values into the bot's secret card as:
   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
   VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
5. App Check debug token: run the app locally, copy the debug token from the browser console, add it in Firebase console > App Check > Apps > Manage debug tokens.
6. For a hosted demo later: create a reCAPTCHA Enterprise key and provide VITE_RECAPTCHA_ENTERPRISE_SITE_KEY (needs your approval before any deploy).
7. Chrome desktop v139+ on your laptop: enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input, restart, download the model (see README). Needs about 22 GB free disk and a GPU with over 4 GB VRAM or 16 GB RAM per Chrome's requirements.
8. Optional: Google Account Quota form (ID + selfie check), only if we need paid features. Sprint 2 cutoff Wed Nov 18, 6:00 PM WAT; Sprint 3 cutoff Wed Nov 25, 6:00 PM WAT. Not needed for this text-only app.
9. Before submitting (with your OK): public GitHub repo with Apache-2.0 license visible, public YouTube demo under 3 minutes in English, hosted URL, Devpost text.
