# Receipts — Privacy Steering

Health data is some of the most sensitive data people have. These rules apply to ALL Kiro work
on Receipts. If a feature request conflicts with them, the privacy rule wins; raise it instead.

## 1. Data stays on the device

- Wearable exports (WHOOP CSV, Apple Health XML/ZIP) are parsed **in the browser only**, with the
  File API. Never upload a file, or any part of one, to a server, analytics, logging, or a
  third-party service.
- Don't persist uploaded data. It lives in page memory and is gone on refresh. Only the patient's
  own symptom list and optional "what I live with" note may go in `localStorage`, and nothing
  else without a visible note to the user.
- No trackers, analytics, ad scripts, or fonts loaded from third parties. The only external
  scripts are Chart.js and (on demand, for zip files) JSZip from the jsDelivr CDN.
- Adapters keep only the record types Receipts uses. Skip everything else, including personal
  details in the export such as date of birth or biological sex.

## 2. No real health data in the repo

- Never commit a real export. `.gitignore` blocks `sample-data/`, `export.xml`, `export.zip`,
  `export_cda.xml`, and WHOOP/Oura/Fitbit CSV names. Put any real file in `sample-data/`.
- Test fixtures in `tests/fixtures/` must be **synthetic** and say so in a comment.
- Tools that run on a real export (`tools/summarize-apple-export.js`) print only counts and
  yes/no availability. Never print readings, dates of individual events, or personal fields.
- Demo data is the fictional "Maya, 24". Never use a real person's name or details.

## 3. Only patterns go to the AI

- The live AI step sends **only pattern codes and numbers** (e.g. `orthostatic`, `9 of 12`,
  `35 bpm`). Never raw readings, dates, names, the "what I live with" note, custom symptom names,
  or anything the patient typed.
- Both sides enforce this: `js/ai.js` builds a whitelisted payload, and
  `netlify/functions/write.mjs` re-validates the shape and drops unknown fields.
- Tests prove it (`tests/ai-client.test.js`, `tests/ai-function.test.js`). Keep them passing.
- API keys live only in Netlify environment variables. Never in code, the repo, chat, or logs.
- Free AI tiers (e.g. Gemini free) may use requests to improve the provider's products. That's
  acceptable only because we send pattern numbers alone.

## 4. Be honest with the user

- The Connect screen states plainly that files are read on the device and never uploaded or saved.
- If we ever add a feature that sends data off the device (e.g. a real WHOOP API connection or
  "send to my doctor"), it needs clear, specific consent first, and this file must be updated.
