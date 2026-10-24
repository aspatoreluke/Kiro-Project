# Receipts — Design

## Overview

Receipts is a single-page web app built with plain HTML, CSS, and JavaScript plus one small
charting library. It runs entirely in the browser with no login and no server. All data is demo
data for one fictional patient ("Maya, 24"), shaped like a real WHOOP export. An on-device
"writing step" turns detected patterns into warm, plain-English text. Safety rules (no diagnosis,
own-baseline framing, the clinician decides) are enforced in code, documented in a steering file,
and checked by an agent hook.

This document explains, in plain terms, how the pieces fit together and how each of the 11
requirements is met.

### Design goals (mapped to what wins this hackathon)
- **Ships and demos in ~2 minutes.** One deployable folder, instant Netlify link.
- **Creative and human.** The "Receipts" metaphor and per-patient personalization are front and
  center.
- **Safe by construction.** Diagnosis-free language is enforced, not just hoped for.
- **Understandable by non-coders.** Simple structure, heavily commented, no build tools.

---

## Technology choices

| Concern | Choice | Why |
|---|---|---|
| App type | Single-page app, vanilla HTML/CSS/JS | No build tools; easy to read, deploy, and explain |
| Charts | Chart.js via CDN | Simple, well-documented line/scatter charts; no setup |
| Data | Static JS/JSON bundled in the app | Works offline; deterministic demo; no server |
| Writing step | Local template engine (swappable for live AI) | No API key; always works on stage; Req 7 |
| Storage | `localStorage` for the patient's symptom set & notes | Personalization without a login; Req 1b |
| Styling | Hand-written CSS with design tokens | Calm palette, large text, high contrast; Req 9 |
| Deploy | Netlify (drag-and-drop or GitHub auto-deploy) | Free public URL; Req 11 |

No framework (React/Vue) is used on purpose: it keeps the project legible for a non-coding team and
removes build steps that can fail during a live demo.

---

## File structure

```
Kiro-Project/
  index.html              # The whole app shell + 5 screens
  styles.css              # Calm, accessible design system
  app.js                  # Navigation, rendering, wiring
  js/
    data.js               # Maya's 60-day WHOOP-shaped dataset + real-source citations
    symptoms.js           # Starter symptom library + personalization (localStorage)
    analysis.js           # Baseline + Trigger Detective + early warning + cycle check
    writer.js             # The "writing step": patterns -> plain English (swappable AI)
    safety.js             # Diagnosis-language guard used by app + hook
    charts.js             # Chart.js helpers (timeline, pattern mini-charts)
  assets/                 # Icons, print styles
  README.md               # Project + judges overview
  netlify.toml            # Deploy config
  .kiro/
    specs/receipts/        # requirements.md, design.md, tasks.md
    steering/              # safety.md (always-on rules)
    hooks/                 # no-diagnosis-language hook
```

---

## Data model

### Maya's dataset (WHOOP-shaped, synthetic)
Two tables, mirroring how WHOOP structures data (recovery/sleep/cycle objects).

**Daily record** (one row per day for 60 days):
```
{
  date:               "2025-08-26",
  recovery_score:     0-100,        // WHOOP recovery
  hrv_rmssd_ms:       e.g. 18-85,   // HRV in milliseconds
  resting_hr_bpm:     e.g. 52-78,
  sleep_hours:        e.g. 4.2-8.9,
  day_strain:         0-21,         // WHOOP strain
  steps:              integer,
  skin_temp_c:        e.g. 33.0-34.6,
  cycle_day:          1-28 | null   // menstrual cycle day if tracked
}
```

**Posture/standing events** (to support the orthostatic pattern):
```
{ datetime, type: "stand_after_sitting", sitting_minutes, hr_before_bpm, hr_after_bpm }
```

**Symptom taps** (one row per tap):
```
{ datetime, symptom_id, severity: 1-5 | null, note: string | null }
```

### Built-in discoverable patterns (seeded into the data)
1. **Orthostatic (POTS-like):** on most "dizzy" days, heart rate jumps **30+ bpm** within ~20 min of
   standing after sitting >1 hour.
2. **Short-sleep crashes:** "fatigue/crash" taps cluster on days following nights under **6 hours**
   of sleep (lower recovery score, lower HRV).
3. **Pre-menstrual clustering:** symptom frequency rises in the **~7 days before** menstruation
   (cycle_day present), with a small skin-temp shift.

These are deliberately clear so the Trigger Detective finds something real to show, and so the demo
story lands. Values are generated with mild day-to-day noise so charts look natural, not fake.

### Real-source citations (not Maya's data)
Stored as small constants with name + URL, surfaced as footnotes:
- CDC PLACES short-sleep (MA) — context next to the sleep pattern.
- PhysioNet wearable stress/exercise dataset (Hongn et al., 2025) — "the science" footnote.
- WHOOP developer docs / Connected Care — data-model + direction citation.

---

## The analysis engine (`analysis.js`) — plain-English logic

Everything compares Maya to **Maya's own baseline**, never to other people.

1. **Baseline.** For each signal (resting HR, HRV, sleep, recovery), compute the patient's typical
   range (median and a normal band) across the 60 days. This is "Maya's normal."

2. **Trigger Detective.** For each symptom in the patient's set, look at the window *before* each
   tap and ask: what was unusual vs. baseline?
   - Standing test: did HR rise 30+ bpm after standing on symptom days vs. non-symptom days?
   - Sleep test: were symptom days preceded by short-sleep nights more often than chance?
   - Compute a simple strength score (how consistent is the pattern). Keep only the top 2–3 that
     clear a confidence bar. Weak ones are dropped (Req 3.5).

3. **Early warning (Today).** Take "today" (the most recent demo day) and measure how much it looks
   like the average lead-up to past flares (low recovery + low HRV + short sleep + recent standing
   spikes). If it crosses a gentle threshold → "pacing day" message; otherwise → reassuring message.
   Never diagnostic, never prescriptive.

4. **Cycle check.** Only runs if cycle_day exists. Bucket symptom taps by cycle phase; if a phase
   holds a clear majority, report it as a pattern. Otherwise the whole section is hidden (Req 5.3).

Each result is a small, structured "finding" object:
```
{ id, title, strength, chartSpec, facts: {...} }   // facts feed the writing step
```
Note: findings carry **facts and numbers**, not sentences. Wording is added later by the writer, so
the safety guard sits in exactly one place.

---

## The writing step (`writer.js`) — the "AI" layer

**What it does:** turns a structured finding into warm, plain English for three places — Trigger
Detective explanations, the Today message, and both brief versions.

**Default implementation (templates):**
```
writeFinding(finding) -> sentence
writeTodayMessage(todayScore) -> message
writeBrief(findings, audience: "doctor" | "patient") -> brief sections
```
Templates fill in the finding's real numbers, e.g.:
> "On 8 of 12 days you felt **dizzy**, your heart rate rose **34 bpm** within 20 minutes of standing
> up — higher than your usual **{baseline}**."

**Swappable AI:** `writer.js` exposes a single `generate()` seam. The default is the local template
engine. A `generate()` backed by a live model (OpenAI/Claude) could be dropped in later with no
other code changes. We'll say exactly this to judges: local by default for reliability, AI-ready by
design.

**Every generated string passes through `safety.js` before display.**

---

## Safety design (`safety.js` + steering + hook)

Three layers, so safety is enforced, documented, and checked:

1. **In-code guard (`safety.js`).** A function `assertSafeText(text)` scans for banned patterns:
   diagnostic verbs/phrases ("diagnose", "you have", "this means you have"), disease names used as
   conclusions, treatment/medication verbs ("prescribe", "take", drug names). The writer calls this
   on every output. In the demo it can surface a visible "safety check passed" indicator — a nice
   on-stage proof point.

2. **Steering document (`.kiro/steering/safety.md`).** Always-on rules for all Kiro work: never
   diagnose or recommend treatment; always own-baseline framing; the clinician decides; plain, kind,
   non-alarming language; no real PHI. This governs how Kiro writes code and copy.

3. **Agent hook (`.kiro/hooks/`).** A hook that runs the same banned-language check (via a small
   script) against generated/user-facing text and flags violations, so diagnostic language can't
   slip in unnoticed. This is both a safety net and a visible "how we used Kiro" artifact.

Mapping: Requirement 8 is satisfied by all three layers together.

---

## Screen-by-screen design

A fixed bottom nav (thumb-friendly on mobile) switches between the five screens. Screens are plain
sections shown/hidden by `app.js`.

### Screen 0 (pre-step) — Personalize (Req 1b)
- First-run card: optional "what I live with" note (skippable) + symptom picker (add/remove/reorder,
  choose icon/color). Choices saved to `localStorage`. Reachable later via a small "Edit symptoms"
  link so the demo can show it on demand.

### Screen 1 — Symptom tap (Req 1)
- Watch-widget styling: big rounded buttons from the patient's set, each with its icon/color.
- Tap → calm confirmation ("Logged, 2:14 PM") → entry recorded with surrounding signals.

### Screen 2 — Timeline (Req 2)
- 60-day Chart.js line chart: resting HR, HRV, sleep (toggleable lines).
- Symptom taps drawn as colored markers on the date axis using each symptom's icon/color.
- Large text, high-contrast gridlines.

### Screen 3 — Trigger Detective (Req 3)
- Top 2–3 finding cards. Each: a one-sentence explanation (from the writer), a simple mini-chart,
  and a quiet "compared to your own baseline" label.
- CDC short-sleep footnote appears under the sleep finding.

### Screen 4 — Today (Req 4)
- One large card: either "Looks like a pacing day — consider taking it easy" or "Looks like a good
  day." Calm colors (soft amber / soft green), supportive copy, short "why" line referencing the
  patient's own recent signals.

### Screen 5 — Pre-appointment brief (Req 6)
- One-page, print-optimized layout. Doctor/patient toggle at top.
  - **Doctor view:** 2–3 patterns with mini-charts; a suggested evaluation question ("Patterns like
    this are often evaluated with an orthostatic vitals check"); the non-diagnosis note.
  - **Patient view:** same findings in plain language + 3 questions to ask the doctor; the
    non-diagnosis note.
- "Send to my doctor" → simulated confirmation + "Save/Print as PDF" (uses the browser's print to
  PDF; a dedicated print stylesheet makes it a clean single page).
- The note "This is not a diagnosis — your clinician decides" is always visible on both views.

---

## Design system (Req 9)

- **Palette:** calm, light-blue world with dark-blue anchors.
  - Background: very light blue / off-white (e.g. `#F4F8FC`).
  - Surface / cards: white with soft blue-tinted shadows.
  - Primary buttons & nav: deep navy/dark blue (e.g. `#1B3A5B`) with white text (high contrast).
  - Accents / chart lines: mid blues (e.g. `#3E7CB1`, `#6BA8D6`).
  - Today card states (kept calm, blue-family where possible): "pacing day" = soft muted
    blue-amber (`#E8C68A` background, dark text) so it reads as *gentle caution*, not alarm;
    "good day" = soft blue-green (`#8FBFB0`). No reds anywhere.
  - Text: dark navy ink (`#16293B`) on light backgrounds for strong contrast.
- **Type:** large base size (18px+), generous line height, system font stack for legibility.
- **Layout:** mobile-first, single column, thumb-reachable bottom nav, large tap targets (44px+).
- **Tone:** supportive and plain; no red alarms, no clinical jargon in patient-facing text.
- **Accessibility:** semantic HTML, labeled controls, focus styles, aria-labels on icon buttons,
  color never the only signal; dark-blue-on-light and white-on-dark-blue pairings chosen to meet
  strong contrast. (Honest note for judges: full WCAG conformance needs manual assistive-tech
  testing beyond this build.)

---

## Deployment (Req 11)

- `netlify.toml` sets the publish directory to the project root (static site, no build step).
- Two paths: drag-and-drop the folder to Netlify Drop, or connect the GitHub repo for auto-deploy.
- The `.kiro` folder is committed and **excluded from `.gitignore`** so judges can inspect specs,
  steering, and hooks. README + judges' write-up included.

---

## How the requirements map to the design

| Requirement | Where it's handled |
|---|---|
| 1 Tap logging | Screen 1 + `symptoms.js` |
| 1b Personalized symptoms | Screen 0 + `symptoms.js` + `localStorage` |
| 2 Timeline | Screen 2 + `charts.js` |
| 3 Trigger Detective | Screen 3 + `analysis.js` + `writer.js` |
| 4 Early warning | Screen 4 + `analysis.js` + `writer.js` |
| 5 Cycle awareness | `analysis.js` (conditional) + Screen 3/5 |
| 6 Brief (both versions) | Screen 5 + `writer.js` + print stylesheet |
| 7 AI/writing step | `writer.js` (templates, AI-swappable) |
| 8 Safety | `safety.js` + steering + hook |
| 9 Design & accessibility | `styles.css` design system |
| 10 Five screens & nav | `index.html` + `app.js` |
| 11 Deploy & repo | `netlify.toml`, GitHub, `.kiro` committed |
