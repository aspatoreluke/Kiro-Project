---
inclusion: fileMatch
fileMatchPattern: ['**/*.html', '**/*.css', 'app.js', 'js/writer.js', 'js/charts.js', 'netlify/functions/*.mjs']
---

# Receipts — Accessibility & Design Steering

Receipts is used by people who may be exhausted, dizzy, in pain, or foggy. Design for a bad
day. This steering file loads whenever Kiro works on screens, styles, charts, or wording.

## Reading level and wording

- Write at about an **8th-grade reading level**: short sentences (aim for under 20 words, never
  over 40), common words, one idea per sentence.
- Say "heart rate", not "HR", in sentences. Explain HRV the first time: "heart rate variability
  (HRV)".
- Use "you" and "your usual". Avoid jargon such as "orthostatic", "baseline deviation", or
  "statistically significant". If a clinical term is needed (doctor brief only), keep it in the
  clinician's part.
- Never alarming: no "warning", "danger", "abnormal", "critical", red text, or exclamation points.
- Buttons say what they do: "Use demo data (Maya)", not "Continue".

## Text size and contrast

- Base font size at least **18px**. Nothing interactive smaller than 14px.
- Text contrast at least **4.5:1** (WCAG AA); large text at least 3:1. Our palette pairs (dark
  navy `#16293B` on `#F4F8FC`, white on `#1B3A5B`) pass. Check any new color pair before using it.
- **Color is never the only signal.** Pacing vs. good day also differs in words; chart lines have
  labels; taps have icons as well as colors.

## Touch and layout

- Tap targets at least **44×44px**, with space between them. One-handed use on a 390px-wide phone.
- No sideways scrolling on phones. Mobile-first single column.
- Everything works with a keyboard: visible focus outline, logical tab order, no keyboard traps.

## Screen readers

- Use real elements (`button`, `label`, `h1`–`h3`), not clickable `div`s.
- Icon-only buttons need `aria-label`. Emoji used as decoration get `aria-hidden="true"`.
- Status messages ("Logged ✓", upload progress) use `role="status"` / `aria-live="polite"`.
- Charts must have the same information in text nearby (the finding sentence does this).

## Motion

- Keep animation short and subtle. Nothing flashes. Respect calm over flashy.

## How we check

- `tools/browser-check.js` emulates a 390px phone and verifies no sideways scroll and 44px+ watch
  buttons.
- Honest limit: automated checks can't prove full WCAG conformance. That needs manual testing with
  screen readers (VoiceOver, TalkBack) and an accessibility expert review.
