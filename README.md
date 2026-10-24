# 🧾 Receipts

**Your body's evidence, in plain sight.**

**Live app:** https://melodic-bonbon-4f819b.netlify.app (no login)

Receipts helps people with chronic, hard-to-diagnose conditions (POTS, long COVID, ME/CFS,
migraines, endometriosis, autoimmune conditions) turn the data their wearable already collects
into clear patterns they can bring to their doctor.

These patients are often dismissed because symptoms don't show up in a 15-minute visit. Their
watch sees what happens at home, but doctors can't use single readings or raw data. Receipts
bridges that gap: tap a symptom the moment it happens, and the app compares what your body did
around it to **your own baseline**, finds the 2–3 strongest patterns, gives a gentle daily
heads-up, and writes a one-page brief for the appointment.

**Receipts never diagnoses. Your clinician decides.**

Built for the Hackachusetts Healthcare & Biotech track: *turning wearable data into better
healthcare.* How we built it with Kiro: [`JUDGES.md`](./JUDGES.md).

---

## What it does

| Screen | What you see |
|---|---|
| **Personalize** | Pick the symptoms *you* live with, or add your own words ("hives", "heart racing"). |
| **Connect** | Upload a WHOOP or Apple Health export, use Maya's demo data, or see the upcoming WHOOP sign-in. |
| **Log** + **Watch view** | Big one-tap symptom buttons, plus a smartwatch face: tap on the "wrist", see it land on the timeline. |
| **Timeline** | Up to 90 days of resting heart rate, HRV, sleep, and steps, with every tap marked. |
| **Patterns** | Trigger Detective: what tends to come *before* your symptoms, vs. your own usual. |
| **Today** | "Looks like a pacing day" or "Looks like a good day", gently. |
| **Brief** | A printable one-page doctor version, a plain-language "for me" version with 3 questions to ask, and Save/Print as PDF. |

## Wearable integration

- **WHOOP:** the in-app Data Export (`physiological_cycles.csv`, `sleeps.csv`).
- **Apple Health:** iPhone Health app → profile → *Export All Health Data* (`export.zip` or
  `export.xml`). A real 452 MB export loads in about 1 second, read in 8 MB slices.
- **Demo:** "Maya, 24", 60 days of synthetic WHOOP-shaped data with three discoverable patterns.
- **Connect WHOOP account (coming soon):** the official API sign-in is the next step. The data
  model already matches it.

Each device has an **adapter** (`js/adapters/`) that converts its export into one standard daily
model, so the rest of the app never knows which device the data came from. Adapters never invent
values: if HRV or cycle data is missing, the app says plainly which insights aren't available.

## Privacy

- Exports are read **in your browser**. Nothing is uploaded or saved; refreshing clears it.
- Only **pattern codes and numbers** ("9 of 12 dizzy days, 35 bpm") go to the AI. Never raw
  readings, dates, names, or anything you typed.
- Real exports can't be committed: `.gitignore` blocks them. Test files are synthetic.

## Live AI, with a safety net

A Netlify function asks Google Gemini (free tier; Claude also supported) to reword the patterns
warmly. The app shows template text instantly and swaps in AI text only if it arrives within
8 seconds **and** passes two checks:

1. the no-diagnosis guard (`js/safety.js`), and
2. a numbers check: every number must match the data.

If anything fails, that spot keeps the template wording. AI text carries an
**"AI-written · checked for safety"** label. The disclaimer and the doctor questions are always
hand-written.

---

## Run it

It's a static site: no build step, no login.

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

Locally the AI function isn't running, so you'll see the template wording (that's the fallback
working). To enable AI on Netlify, add `GEMINI_API_KEY` (free at aistudio.google.com) under
**Project configuration → Environment variables**, then redeploy. Optional: `ANTHROPIC_API_KEY`.

## Test it

```bash
npm install              # test-only dependency (fast-check)
npm test                 # 57 tests, including 25 property-based tests
node tools/browser-check.js https://melodic-bonbon-4f819b.netlify.app/
                         # drives a fresh headless Chrome at phone size through every screen
EXPECT_AI=1 node tools/browser-check.js https://melodic-bonbon-4f819b.netlify.app/
                         # ...and checks the live AI answered and passed the safety checks
```

## How it's built

Plain HTML/CSS/JavaScript and [Chart.js](https://www.chartjs.org/). No framework, on purpose:
the code stays readable for non-coders and the demo can't break on a build step.

```
index.html, styles.css, app.js   screens, calm light-blue design, navigation
js/data.js                       Maya's synthetic dataset + real-source citations
js/adapters/standard-model.js    the one daily data shape everything uses
js/adapters/csv.js, whoop.js     WHOOP CSV export -> standard model
js/adapters/apple-health.js      Apple Health export (streamed) -> standard model
js/datasource.js                 demo vs. uploaded data; session symptom taps
js/analysis.js                   own-baseline Trigger Detective, Today score
js/safety.js                     the no-diagnosis / no-treatment guard
js/writer.js, js/ai.js           template wording + safety-checked live AI wording
js/charts.js                     timeline and mini-charts
netlify/functions/write.mjs      serverless AI step (patterns in, wording out)
tests/                           example tests + property-based tests (*.props.test.js)
tools/                           browser walk-through, MCP docs client, export summary
.kiro/                           specs, steering, hooks, MCP config (kept in the repo on purpose)
```

## Sources

- Demo data mirrors the [WHOOP developer API](https://developer.whoop.com/api/) model. No real
  personal health information is used.
- Context only, not anyone's data: CDC PLACES short-sleep prevalence (Massachusetts);
  [PhysioNet wearable stress & exercise dataset](https://physionet.org/content/wearable-device-dataset/1.0.1/)
  (Hongn et al., 2025).
- Accessibility: built to large-text, high-contrast, 44px-target rules and checked automatically
  at phone size. Full WCAG conformance needs manual screen-reader testing and expert review.
