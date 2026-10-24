# 🧾 Receipts

**Your body's evidence, in plain sight.**

Receipts helps people with chronic, hard-to-diagnose conditions (POTS, long COVID, ME/CFS,
migraines, endometriosis, autoimmune conditions) turn the data their wearable already collects into
clear patterns they can share with their doctor.

These patients are often dismissed because their symptoms don't show up during a short clinic visit.
Their watch sees what happens at home — but doctors don't trust single readings and don't have time
to read raw data. Receipts bridges that gap: tap a symptom the moment it happens, and the app gently
compares the body's signals around that moment to the patient's **own baseline**, surfaces the 2–3
strongest patterns, and generates a one-page brief for the appointment.

**Receipts never diagnoses. The clinician always decides.**

Built for the Hackachusetts Healthcare & Biotech track — *turning wearable data into better
healthcare.*

---

## Run it

It's a plain static web app — no build step, no login, no server.

- **Easiest:** open `index.html` in a browser.
- **Local server (recommended for the charts):**
  ```bash
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```
- **Live demo:** _(add your Netlify link here once deployed)_

---

## The five screens

1. **Log** — big, watch-style buttons to tap a symptom the moment it happens.
2. **Timeline** — 60 days of resting HR, HRV, and sleep, with every symptom tap marked.
3. **Patterns (Trigger Detective)** — the strongest patterns before symptoms, vs. your own baseline.
4. **Today** — a gentle "pacing day" or "good day" heads-up.
5. **Brief** — a printable one-page doctor brief, a toggle to a plain-language patient version, and a
   simulated "Send to my doctor" + Save/Print as PDF.

Plus a **Personalize** step: the patient chooses the symptoms *they* live with (add their own, remove
what doesn't fit), so the app reflects their condition — POTS, migraines, a mast cell disorder, etc.

---

## Data

- **Maya (24), 60 days — synthetic, WHOOP-shaped.** The demo data mirrors the
  [WHOOP developer API](https://developer.whoop.com/api/) model (recovery score, HRV in ms, resting
  heart rate, sleep, daily strain, skin temp, cycle day), so it could plug into a real WHOOP export
  with no redesign. No real personal health information is used.
- **Honest real-world citations (context only, not Maya's data):**
  - CDC PLACES — short sleep duration among adults, Massachusetts.
  - PhysioNet — *Wearable Device Dataset from Induced Stress and Structured Exercise Sessions*
    (Hongn et al., 2025), grounding the tap-and-measure approach.
  - WHOOP developer docs / Connected Care — the data model and real-world direction.

Three patterns are deliberately present in Maya's data so the Trigger Detective has something real to
find: an orthostatic heart-rate jump before dizzy spells, fatigue crashes after short-sleep nights,
and a rise in symptoms the week before her period.

---

## Safety

Safety is enforced in three layers, not just hoped for:

1. **In-code guard** (`js/safety.js`): every generated sentence passes `assertSafeText()` before it's
   shown. Diagnostic or prescriptive wording is blocked and replaced with a safe fallback.
2. **Steering** (`.kiro/steering/safety.md`): always-on rules that govern all Kiro work — never
   diagnose, never prescribe, always frame findings vs. the patient's own baseline, the clinician
   decides, plain and kind language, no real PHI.
3. **Agent hook** (`.kiro/hooks/`): re-checks the app's text for diagnostic language and flags
   violations.

---

## How it's built

Plain HTML/CSS/JavaScript + [Chart.js](https://www.chartjs.org/). No framework, on purpose — it keeps
the project readable and the demo bulletproof.

```
index.html          app shell + 5 screens
styles.css          calm light-blue design system
app.js              navigation + rendering + wiring
js/data.js          Maya's WHOOP-shaped dataset + citations
js/symptoms.js      symptom library + personalization (localStorage)
js/safety.js        the no-diagnosis guard
js/analysis.js      baseline + Trigger Detective + early warning + cycle check
js/writer.js        the writing step (templated, AI-swappable)
js/charts.js        Chart.js helpers
.kiro/              specs, steering, hooks  ← kept in the repo on purpose
```

See [`JUDGES.md`](./JUDGES.md) for how we used Kiro specs, steering, and hooks.
