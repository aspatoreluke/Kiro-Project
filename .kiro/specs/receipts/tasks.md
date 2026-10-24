# Receipts — Implementation Tasks

Build order is top-to-bottom. Each task lists the requirements it satisfies. Checkboxes let us
track progress together.

- [ ] 1. Project scaffold & design system
  - Create `index.html` shell with the 5 screens + personalize step and a thumb-friendly bottom nav.
  - Create `styles.css` with the light-blue / dark-blue design tokens, large text, high contrast,
    mobile-first layout, and a print stylesheet for the brief.
  - Add Chart.js via CDN.
  - _Requirements: 9, 10_

- [ ] 2. Demo data (WHOOP-shaped) with seeded patterns
  - Build `js/data.js`: Maya's 60 daily records (recovery, HRV ms, resting HR, sleep hours, strain,
    steps, skin temp, cycle day), standing events, and symptom taps.
  - Seed the 3 discoverable patterns (orthostatic 30+ bpm; short-sleep crashes; pre-menstrual rise)
    with natural noise.
  - Add real-source citation constants (CDC short sleep, PhysioNet, WHOOP) with URLs.
  - _Requirements: 3, 4, 5, 7 (inputs); data decision in intro_

- [ ] 3. Symptom library & personalization
  - Build `js/symptoms.js`: starter symptom library (icon + color each), and functions to
    add/remove/reorder and read/write the patient's set to `localStorage`.
  - Optional, skippable "what I live with" note (used only for starter suggestions + kind wording).
  - _Requirements: 1b, 8 (5b)_

- [ ] 4. Safety guard
  - Build `js/safety.js`: `assertSafeText(text)` scanning for diagnostic/prescriptive language
    (diagnose, "you have", disease-as-conclusion, treatment/med verbs, drug names) and returning
    pass/fail + reasons.
  - Expose a small API the writer and the hook script can both call.
  - _Requirements: 8_

- [ ] 5. Analysis engine
  - Build `js/analysis.js`: compute own-baseline per signal; Trigger Detective (standing test,
    short-sleep test, strength scoring, keep top 2–3, drop weak); early-warning "today" score;
    cycle check (only if cycle data present). Output structured findings (facts/numbers, no prose).
  - _Requirements: 3, 4, 5_

- [ ] 6. Writing step (AI layer, templated + swappable)
  - Build `js/writer.js`: `writeFinding`, `writeTodayMessage`, `writeBrief(audience)` filling real
    numbers into warm, plain-English templates. Single `generate()` seam for a future live model.
  - Route every output through `safety.js` before returning.
  - _Requirements: 7, 8_

- [ ] 7. Charts
  - Build `js/charts.js`: 60-day timeline (resting HR, HRV, sleep; toggleable) with symptom markers
    using each symptom's icon/color; small per-finding mini-charts.
  - _Requirements: 2, 3_

- [ ] 8. Screen 0 — Personalize
  - First-run card: "what I live with" (skippable) + symptom picker (add/remove/reorder, icon/color).
    "Edit symptoms" entry point for the demo.
  - _Requirements: 1b_

- [ ] 9. Screen 1 — Symptom tap
  - Watch-widget big buttons from the patient's set; tap records a timestamped entry with
    surrounding signals; calm confirmation.
  - _Requirements: 1_

- [ ] 10. Screen 2 — Timeline
  - Render the 60-day chart with symptom markers; line toggles; large, high-contrast styling.
  - _Requirements: 2_

- [ ] 11. Screen 3 — Trigger Detective
  - Render top 2–3 finding cards (writer sentence + mini-chart + "vs. your own baseline" label);
    CDC short-sleep footnote under the sleep finding.
  - _Requirements: 3, 7_

- [ ] 12. Screen 4 — Today
  - Early-warning card: "pacing day" or "good day" with calm colors and a short "why" line from the
    patient's own recent signals.
  - _Requirements: 4, 7_

- [ ] 13. Screen 5 — Pre-appointment brief
  - One-page printable layout; doctor/patient toggle; suggested clinician question (evaluation, not
    diagnosis); 3 patient questions; always-visible "not a diagnosis" note; "Send to my doctor"
    simulated confirmation + Save/Print as PDF.
  - _Requirements: 6, 7, 8_

- [ ] 14. Navigation & wiring
  - `app.js`: show/hide screens, bottom-nav state, first-run personalize flow, re-render on symptom
    changes.
  - _Requirements: 10_

- [ ] 15. Steering document
  - `.kiro/steering/safety.md`: always-on safety rules (no diagnosis/treatment; own-baseline
    framing; clinician decides; plain/kind/non-alarming; no real PHI).
  - _Requirements: 8_

- [ ] 16. Agent hook — no diagnostic language
  - Add a hook under `.kiro/hooks/` that runs the banned-language check against generated/
    user-facing text and flags violations (warns + lists problems).
  - _Requirements: 8_

- [ ] 17. README & judges' write-up
  - `README.md`: what Receipts is, how to run/deploy, data & citations, safety stance.
  - Judges' write-up: how we used specs, steering, and hooks (and the "non-coders directing Kiro"
    story).
  - _Requirements: 11_

- [ ] 18. Deploy & repository
  - Add `netlify.toml`; verify the app runs locally; deploy to a free Netlify public URL.
  - Commit everything incl. `.kiro`; confirm `.kiro` is NOT in `.gitignore`; push to the public
    GitHub repo.
  - _Requirements: 11_

- [ ] 19. Final verification pass
  - Walk all 5 screens on a mobile viewport; confirm patterns render, brief prints to one page,
    safety guard passes on all generated text, personalization persists, public link loads.
  - _Requirements: all_

---

## v2 Tasks (judging strengthening) — do in priority order

### Priority 1 — Wearable integration
- [ ] 20. Standard data model + datasource switch
  - `js/adapters/standard-model.js` (shape + validator + availability flags); `js/datasource.js`
    (demo vs uploaded; one API the app reads). Route existing screens through the datasource.
  - _Requirements: 13, 14_
- [ ] 21. WHOOP CSV adapter
  - `js/adapters/whoop.js`: parse WHOOP CSV → standard model; flexible headers; skip bad rows.
  - _Requirements: 13_
- [ ] 22. Apple Health adapter
  - `js/adapters/apple-health.js`: parse `export.xml` (and zipped export via JSZip) → standard model.
  - _Requirements: 13_
- [ ] 23. Connect-your-wearable screen
  - Upload (WHOOP/Apple), "Use demo data (Maya)" default, "Connect WHOOP (coming soon)" explainer,
    privacy note, missing-metric messaging.
  - _Requirements: 12, 14_
- [ ] 24. Watch view
  - Smartwatch-styled tap screen; taps appear on the timeline.
  - _Requirements: 15_
- [ ] 25. .gitignore sample-data rules
  - Ignore `sample-data/`, `*.export.xml`, personal export patterns; never commit real exports.
  - _Requirements: 18.5_

### Priority 2 — Live AI
- [ ] 26. Netlify AI function
  - `netlify/functions/write.js`: patterns-only in → text out; key from env var.
  - _Requirements: 16_
- [ ] 27. Client AI wiring + fallback + label
  - `writer.js`: 8s timeout, safety check on every response, auto-fallback to templates, "AI-written
    · checked for safety" label.
  - _Requirements: 16_

### Priority 3 — Property-based testing
- [ ] 28. Property tests
  - `tests/analysis.props.test.js`, `safety.props.test.js`, `adapters.props.test.js`; summarize
    findings.
  - _Requirements: 17_

### Priority 4 — More Kiro features
- [ ] 29. Accessibility & privacy steering docs
  - `.kiro/steering/accessibility.md`, `.kiro/steering/privacy.md`.
  - _Requirements: 18.1, 18.2_
- [ ] 30. Second hook (run tests on core save)
  - `.kiro/hooks/run-tests-on-core-save.json` + runner.
  - _Requirements: 18.3_
- [ ] 31. MCP server (genuine use)
  - Set up and use a fetch/docs or GitHub MCP; document use (or the attempt).
  - _Requirements: 18.4_

### Priority 5 — Docs
- [ ] 32. Update JUDGES.md and README.md
  - Wearable/adapters, privacy, live AI + fallback, PBT (+ catches), new steering/hooks, MCP, Kiro
    tools used, spec-driven vs vibe coding from a non-coder view.
  - _Requirements: 11_

### Stretch
- [ ] 33. FHIR brief export (prototype) — cut first under time pressure.
  - _Requirements: 19_

### Final
- [ ] 34. Verify deployed site in a fresh browser; laptop + phone test checklist.
  - _Requirements: all_
