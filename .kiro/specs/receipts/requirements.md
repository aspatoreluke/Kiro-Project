# Receipts — Requirements

## Introduction

**Receipts** is a calm, browser-based web app for people living with chronic, hard-to-diagnose
conditions (POTS, long COVID, ME/CFS, migraines, endometriosis, autoimmune conditions). These
patients are often dismissed because their symptoms don't appear during a short clinic visit. Their
wearable (e.g., a WHOOP-style band) sees what happens at home, but doctors don't trust single
readings and don't have time to read raw data.

Receipts lets a patient tap a symptom the moment it happens, then compares the body's signals
around that moment against the patient's **own baseline**. It surfaces the 2–3 strongest patterns,
gives a gentle daily "pacing" heads-up, and produces a one-page pre-appointment brief the patient
can share with their clinician. It never diagnoses. The clinician always decides.

The app runs entirely in a browser with **no login**, uses realistic demo data for one fictional
patient ("Maya, 24") shaped like a real WHOOP export, and uses an AI/templated writing step to turn
detected patterns into kind, plain-English explanations.

### Product principles
- **Patient's own baseline, never population averages**, for all pattern claims.
- **Patterns, not diagnoses.** Every output is a described pattern, not a medical conclusion.
- **Calm, kind, non-alarming** language and visual design throughout.
- **No real personal health information** — demo data only.
- **Shipped and shareable** — deployed to a public link; demo tells its story in ~2 minutes.

### Demo data & sources
- **Maya's 60-day data:** realistic synthetic data shaped to the WHOOP data model
  (recovery score 0–100, HRV in ms, resting heart rate, sleep hours, daily strain, skin temp,
  cycle day), with clear, discoverable patterns.
- **Real context citations (not used as Maya's data):**
  - CDC PLACES "short sleep duration among adults" (Massachusetts) — context stat next to the
    sleep pattern.
  - PhysioNet "Wearable Device Dataset from Induced Stress and Structured Exercise Sessions"
    (Hongn et al., 2025) — cited as scientific grounding for the tap-and-measure approach.
  - WHOOP developer docs / Connected Care — cited as the real-world data model and direction.

---

## Requirements

### Requirement 1 — One-tap symptom logging
**User story:** As a patient, I want to tap a symptom the instant it happens, so the moment is
captured without effort or typing.

#### Acceptance criteria
1. WHEN the symptom screen is shown THEN the system SHALL display large, high-contrast buttons for
   the patient's current symptom set (see Requirement 1b for how that set is chosen).
2. WHEN a symptom button is tapped THEN the system SHALL record a timestamped entry for that
   symptom.
3. WHEN a symptom is recorded THEN the system SHALL associate it with the body signals in the
   minutes/hours before and after (heart rate, HRV, prior night's sleep, steps, activity/posture
   change) from the demo data.
4. WHEN a symptom is recorded THEN the system SHALL give calm visual confirmation (no alarming
   colors or language).
5. The screen SHALL be styled like a watch/phone widget and be usable one-handed on mobile.

### Requirement 1b — Personalized symptom set ("the app knows what I live with")
**User story:** As a patient with a specific chronic condition, I want to choose the symptoms *I*
experience in my own words, so the app reflects my body — not a generic list.

#### Acceptance criteria
1. The system SHALL ship with a starter symptom library covering common chronic-illness experiences
   (e.g., dizzy, brain fog, fatigue, pain, palpitations, nausea, headache, flushing/hives,
   shortness of breath, numbness/tingling, bloating, light sensitivity), each with an icon and
   color.
2. WHEN the patient opens symptom setup THEN the system SHALL let them ADD a custom symptom in their
   own words, REMOVE symptoms that don't apply, and REORDER their set.
3. WHEN adding a custom symptom THEN the system SHALL let the patient choose an icon/color so the
   tap screen feels like their own.
4. The patient's chosen symptom set SHALL persist for the session (stored locally, no login).
5. All downstream features (timeline marks, Trigger Detective, early warning, brief) SHALL operate
   on the patient's chosen symptom set, not a hardcoded list.
6. The system SHALL provide an optional, skippable "what I live with" note where the patient can
   name their condition(s) in their own words. IF provided THEN the system SHALL use it only to
   (a) suggest sensible starter symptoms and (b) word messages kindly — NEVER to diagnose, confirm,
   or rule out any condition.
7. IF the patient provides no condition note THEN the system SHALL use a neutral default symptom set
   and never prompt in a way that implies a diagnosis.

### Requirement 2 — 60-day timeline
**User story:** As a patient, I want to see my body signals over time with my symptom taps marked,
so I can see the whole picture at a glance.

#### Acceptance criteria
1. WHEN the timeline screen is shown THEN the system SHALL display a 60-day chart of resting heart
   rate, HRV, and sleep.
2. WHEN symptom taps exist THEN the system SHALL mark each tap on the timeline at its date, using
   the symptom's chosen icon/color from the patient's personalized set.
3. WHEN the user focuses a marked tap THEN the system SHALL show which symptom it was and the date.
4. The chart SHALL be readable on mobile with large text and high contrast.

### Requirement 3 — Trigger Detective (pattern finding vs. own baseline)
**User story:** As a patient, I want the app to find what tends to come *before* my symptoms
compared to my own normal, so I can understand my likely triggers.

#### Acceptance criteria
1. WHEN data is loaded THEN the system SHALL compute the patient's own baseline for each signal.
2. WHEN analyzing symptoms THEN the system SHALL detect patterns in what preceded symptoms relative
   to that baseline (e.g., heart-rate rise after standing before dizzy episodes; crashes after
   short-sleep nights).
3. WHEN patterns are found THEN the system SHALL present the top 2–3, each with a simple chart and a
   one-sentence plain-English explanation.
4. Each explanation SHALL be phrased as a pattern vs. the patient's own baseline, never as a
   diagnosis or cause.
5. IF a pattern is weak or unsupported THEN the system SHALL NOT present it.

### Requirement 4 — Early warning / "Today" pacing card
**User story:** As a patient, I want a gentle daily heads-up when today looks like the lead-up to a
past flare, so I can pace myself.

#### Acceptance criteria
1. WHEN the Today screen is shown THEN the system SHALL compare today's signals to the lead-up of
   past flare-ups.
2. IF today resembles past pre-flare patterns THEN the system SHALL show a calm pacing suggestion
   (e.g., "Your body looks like it did before your last few harder days. Consider taking it easy.").
3. IF today looks typical/good THEN the system SHALL show a reassuring message.
4. The message SHALL be non-alarming and SHALL NOT diagnose or prescribe.

### Requirement 5 — Cycle awareness (only if data supports it)
**User story:** As a patient with cycle data, I want to know if my symptoms cluster around certain
cycle phases, so I can discuss timing with my clinician.

#### Acceptance criteria
1. IF temperature/cycle data is available THEN the system SHALL check whether symptoms cluster
   around cycle phases.
2. IF a cluster is found THEN the system SHALL describe it as a pattern vs. the patient's own
   baseline.
3. IF cycle data is absent or no cluster is found THEN the system SHALL omit this entirely (no empty
   or speculative section).

### Requirement 6 — Pre-appointment brief (doctor + patient versions)
**User story:** As a patient, I want a clear one-page brief to share with my doctor, plus a
plain-language version for myself, so the visit starts from evidence.

#### Acceptance criteria
1. WHEN the brief screen is shown THEN the system SHALL generate a one-page **doctor version**
   showing only the 2–3 most important patterns with simple charts.
2. The doctor brief SHALL end with a suggested clinician question framed as evaluation, not
   diagnosis (e.g., "Patterns like this are often evaluated with an orthostatic vitals check").
3. WHEN the user toggles to the **patient version** THEN the system SHALL show the same findings in
   plain language plus 3 questions to ask the doctor.
4. Every brief SHALL display a clear note: "This is not a diagnosis — your clinician decides."
5. WHEN the user selects "Send to my doctor" THEN the system SHALL simulate sending and allow the
   one-page brief to be printed/saved as PDF. No real message is sent.
6. The brief SHALL be printable as a clean single page.

### Requirement 7 — AI / templated writing step
**User story:** As a patient, I want the explanations, warnings, and briefs written in warm, plain
English, so they're easy to understand and never scary.

#### Acceptance criteria
1. WHEN presenting Trigger Detective explanations, the early-warning message, and both brief
   versions THEN the system SHALL generate the wording from the detected patterns via a writing
   step.
2. The default writing step SHALL run locally with templates (no API key, no network, works
   offline) and SHALL be structured so a live AI model could be swapped in later.
3. All generated text SHALL comply with the safety rules (Requirement 8).

### Requirement 8 — Safety (enforced by steering + a hook)
**User story:** As a patient and a clinician, I need the app to never overstep into diagnosis or
treatment, so it's trustworthy and safe.

#### Acceptance criteria
1. The system SHALL NOT diagnose conditions or recommend treatments/medications anywhere.
2. The system SHALL describe findings as patterns vs. the patient's own baseline, not conclusions.
3. Every brief SHALL include "This is not a diagnosis — your clinician decides."
4. All user-facing language SHALL be plain, kind, and non-alarming.
5. The system SHALL use no real personal health information.
5b. IF the patient provides a "what I live with" note THEN the system SHALL treat it as the
   patient's own words only, and SHALL NOT use it to diagnose, confirm, rule out, or label any
   medical condition.
6. A project **steering document** SHALL codify these safety rules for all Kiro work.
7. An **agent hook** SHALL scan generated/user-facing text for diagnostic or prescriptive language
   (e.g., "diagnose", "you have", disease names used as conclusions, drug names) and flag
   violations.

### Requirement 9 — Design & accessibility
**User story:** As a patient who may be fatigued or in pain, I want a calm, readable, mobile-friendly
app, so it's easy and supportive to use.

#### Acceptance criteria
1. The UI SHALL use large text, high contrast, and a calm palette (supportive, not clinical/scary).
2. The app SHALL be mobile-friendly and usable one-handed.
3. Interactive elements SHALL meet basic accessibility (sufficient contrast, clear labels,
   keyboard/screen-reader friendly where feasible). Note: full WCAG conformance requires manual
   assistive-technology testing beyond this build.
4. The app SHALL run in a modern browser with no login and no server dependency for the demo.

### Requirement 10 — Five screens & navigation
**User story:** As a user, I want a simple 5-screen app, so I can move through the story easily.

#### Acceptance criteria
1. The app SHALL provide exactly these screens: (1) Symptom tap, (2) Timeline, (3) Trigger
   Detective, (4) Today, (5) Pre-appointment brief.
2. The system SHALL provide clear navigation between all five screens.
3. Navigation SHALL be understandable to a non-technical first-time user.

### Requirement 11 — Deployment & repository (Kiro scoring)
**User story:** As a team, we want the project shipped to a public link and pushed to GitHub with
the Kiro artifacts visible, so judges can see how we used Kiro.

#### Acceptance criteria
1. The app SHALL be deployable to a free public URL (Netlify).
2. The project SHALL be pushed to the public GitHub repository.
3. The `.kiro` folder (specs, steering, hooks) SHALL be committed and SHALL NOT be added to
   `.gitignore`.
4. The repository SHALL include a README and a judges' write-up describing use of specs, steering,
   and hooks.

---

## Requirements — v2 upgrades (judging strengthening)

### Requirement 12 — Connect your wearable
**User story:** As a patient, I want to connect my own wearable data or use the demo, so the app
works with my real body data and the wearable-to-healthcare story is explicit.

#### Acceptance criteria
1. The app SHALL provide a "Connect your wearable" screen with three options:
   (a) upload a real export file, (b) use demo data (Maya), (c) a "Connect WHOOP account
   (coming soon)" button.
2. Upload SHALL support at least a WHOOP CSV export and an Apple Health export (`export.xml`, or a
   zipped export). Oura and Fitbit/Google CSV support is a stretch goal.
3. "Use demo data (Maya)" SHALL remain the default so the demo never breaks.
4. The "Connect WHOOP account (coming soon)" button SHALL explain that the official API (OAuth)
   connection is the planned next step. No OAuth is attempted in this build.
5. After a successful upload, the whole app (timeline, Trigger Detective, Today, brief) SHALL run on
   the uploaded data instead of the demo data.

### Requirement 13 — Data adapter layer
**User story:** As the app, I want each device's format converted into one standard data model, so
the rest of the app never needs to know which device the data came from.

#### Acceptance criteria
1. The system SHALL provide an adapter per supported device (e.g. `js/adapters/whoop.js`,
   `js/adapters/apple-health.js`) that converts the device export into the standard daily data
   model: resting HR, HRV, sleep, steps/strain, skin temp, cycle day (when available).
2. All adapters SHALL output the SAME standard shape, so downstream code is device-agnostic.
3. Adapters SHALL tolerate missing or messy rows without crashing (skip/clean bad rows).
4. IF a metric is entirely absent from an upload THEN the adapter SHALL mark it unavailable rather
   than inventing values.

### Requirement 14 — Browser-only processing & privacy
**User story:** As a patient, I want my uploaded health data to stay on my device, so I can trust
the app with sensitive information.

#### Acceptance criteria
1. Uploaded files SHALL be parsed entirely in the browser. No upload data SHALL be sent to any
   server.
2. Uploaded data SHALL NOT be persisted anywhere except, optionally, the user's own browser
   (localStorage), and only with a clear indication.
3. The connect screen SHALL show a plain-language privacy note stating the data never leaves the
   device.
4. IF an uploaded file is missing a metric THEN the app SHALL still work and SHALL plainly say which
   insights aren't available.

### Requirement 15 — Watch view
**User story:** As a presenter, I want a smartwatch-styled tap screen, so I can demo logging a
symptom "from the wrist" and watch it appear on the timeline.

#### Acceptance criteria
1. The app SHALL provide a "watch view" styled like a round/square smartwatch face with the
   patient's symptom buttons.
2. Tapping a symptom in the watch view SHALL record it and SHALL make it appear on the timeline.

### Requirement 16 — Live AI writing step (demo-proof)
**User story:** As a patient, I want warm, human-sounding explanations, with a reliable fallback so
the demo never breaks.

#### Acceptance criteria
1. The system SHALL provide a Netlify serverless function that receives ONLY the detected patterns
   (never raw personal data) and returns the Trigger Detective explanations, the early-warning
   message, and both briefs.
2. The AI API key SHALL be stored as a Netlify environment variable — never in the code or repo.
3. Every AI response SHALL pass `assertSafeText()` before display.
4. IF the AI call fails, takes longer than 8 seconds, or fails the safety check THEN the system
   SHALL automatically fall back to the existing local templates.
5. AI-written text SHALL show a small "AI-written · checked for safety" label; template text SHALL
   not claim to be AI-written.

### Requirement 17 — Property-based testing
**User story:** As a team, we want automated property tests on the risky logic, so we catch edge
cases a non-coder would miss.

#### Acceptance criteria
1. The system SHALL include property-based tests for `js/analysis.js`, `js/safety.js`, and the
   adapters.
2. Properties SHALL include at least: baseline never returns NaN or negative values; adapters always
   output the standard data model even with missing/messy rows; the safety guard always blocks
   "you have [condition]" phrases and medication names, and always allows "this is not a diagnosis".
3. Test results (including anything the tests caught) SHALL be summarized for the team.

### Requirement 18 — More Kiro features (steering, hooks, MCP, powers)
**User story:** As a team judged on Kiro usage, we want to demonstrably use more of Kiro's
capabilities.

#### Acceptance criteria
1. The system SHALL add an accessibility & design steering doc (large text, high contrast, plain
   language at ~8th-grade reading level).
2. The system SHALL add a privacy steering doc (data stays on device; no real health data in the
   repo; only patterns are sent to the AI).
3. The system SHALL add a second agent hook that runs the tests whenever `analysis.js`, `safety.js`,
   or any adapter is saved.
4. The system SHALL set up and genuinely use at least one MCP server (e.g. a fetch/docs MCP to read
   WHOOP / Apple Health export docs, or GitHub MCP) — or, if none can connect quickly, document the
   attempt and intended use.
5. Real personal export files, if used for testing, SHALL NEVER be committed; sample-data patterns
   SHALL be added to `.gitignore`.

### Requirement 19 (STRETCH) — FHIR brief export
**User story:** As a clinic, I want the brief as a structured healthcare-standard file, so it could
plug into records systems.

#### Acceptance criteria
1. IF time allows THEN the doctor brief MAY also export as a FHIR-structured file, clearly labeled a
   prototype.
2. This is explicitly a stretch goal and the first thing cut under time pressure.
