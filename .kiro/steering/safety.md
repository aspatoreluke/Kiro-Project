# Receipts — Safety & Tone Steering

These rules apply to ALL work on the Receipts project: every line of code, every piece of
user-facing text, every generated explanation, and every document. They exist because Receipts is a
health app used by vulnerable people, and it must never overstep into medical advice.

## Non-negotiable safety rules

1. **Never diagnose.** Do not state, imply, confirm, or rule out any medical condition. No "you
   have X", "this is X", "signs of X", or disease names used as a conclusion.
2. **Never recommend treatment or medication.** No drugs, doses, supplements, procedures, or
   "you should take/try/stop..." medical instructions.
3. **Always frame findings as patterns vs. the patient's OWN baseline** — never population averages,
   never medical conclusions. Use language like "compared to your usual", "on days when...",
   "your body looked like...".
4. **The clinician decides.** Every brief and any suggested question must make clear the doctor
   interprets and decides. Include the exact note: "This is not a diagnosis — your clinician
   decides."
5. **Plain, kind, non-alarming language.** No scary words, no red alarms, no urgency language.
   Supportive and calm. Reading level accessible to a tired, non-technical person.
6. **No real personal health information.** Demo data only, for the fictional patient "Maya, 24".
7. **The "what I live with" note is the patient's own words only.** Use it solely to suggest
   starter symptoms and to word messages kindly. Never use it to diagnose, confirm, or label.
8. **Suggested clinician questions must be framed as evaluation, not diagnosis.** e.g. "Patterns
   like this are often evaluated with an orthostatic vitals check" — NOT "you have POTS".

## Tone guidance

- Speak to the patient as a supportive companion, not a doctor or a machine.
- Prefer "your" and "you" framing about patterns, not verdicts.
- Celebrate agency: the app helps the patient bring evidence; it does not judge them.
- When uncertain, say less and defer to the clinician.

## Enforcement

- All generated/user-facing text must pass `js/safety.js` (`assertSafeText`) before display.
- The `.kiro/hooks/` no-diagnosis hook re-checks text and flags violations.
- If any rule here conflicts with a feature request, the safety rule wins; raise it rather than
  silently overstepping.
