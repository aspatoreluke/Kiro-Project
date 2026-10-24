# How we built Receipts with Kiro

We're a **non-coding team**. We didn't hand-write the app — we *directed* Kiro to build it, using
Kiro's structured workflow to stay in control the whole way. That's our story: you don't have to be
an engineer to ship a careful, safe product if you design the process well. Here's how we used each
Kiro capability.

## 1. Spec (requirements → design → tasks)

Instead of jumping to code, we used a **Kiro spec** so we could think and approve before building.

- **`.kiro/specs/receipts/requirements.md`** — 11 requirements in plain-language user stories with
  testable acceptance criteria (one-tap logging, personalized symptoms, timeline, Trigger Detective,
  early warning, cycle awareness, the dual brief, the AI writing step, safety, design, deployment).
- **`.kiro/specs/receipts/design.md`** — the "how": tech choices (plain HTML/CSS/JS so the demo can't
  break), the file layout, the WHOOP-shaped data model, the analysis engine, and a mapping table from
  every requirement to where it's handled.
- **`.kiro/specs/receipts/tasks.md`** — a 19-step build checklist, each task tagged with the
  requirement it satisfies.

**Why it mattered:** as non-coders, the spec was where we actually made the product decisions — in
English. We approved each document before Kiro wrote a line of app code. Nothing got lost, and we can
trace every feature back to a requirement.

## 2. Steering (our safety conscience)

**`.kiro/steering/safety.md`** holds our non-negotiable rules and is applied to *all* Kiro work:

- Never diagnose. Never recommend treatment or medication.
- Always frame findings as patterns vs. the patient's **own baseline**, never conclusions.
- "This is not a diagnosis — your clinician decides" on every brief.
- Plain, kind, non-alarming language. No real personal health information.

**Why it mattered:** in a room full of AI health projects that overclaim, our *restraint* is the
standout. Steering made that restraint systematic — it shaped how Kiro wrote both the code and the
copy, so safety wasn't an afterthought.

## 3. Hook (an automatic safety check)

**`.kiro/hooks/no-diagnosis-language.json`** runs `.kiro/hooks/check-no-diagnosis.js` whenever a JS or
HTML file is saved. It scans the app's text for diagnostic or prescriptive language and flags
violations, using the same rules as our in-app guard.

We tuned it live: our first version was too strict and flagged the *safe* phrase "this is not a
diagnosis." We taught it to allow safe phrasings while still catching real claims like "you have
POTS" or a medication name. That tuning is itself a good demo moment.

**Why it mattered:** it's a second, automatic pair of eyes. Combined with the in-code guard
(`js/safety.js`), diagnostic language has to get past two independent checks to ever reach a user.

## The safety story end-to-end

A pattern the app finds is never turned into a sentence until it passes through one writing step
(`js/writer.js`), and every sentence from that step is checked by `assertSafeText()` before display.
The steering doc governs how that code was written, and the hook re-checks the files. Three layers,
one promise: **Receipts describes patterns; it never diagnoses.**

## What we'd do with more time

- Swap the local template writer for a live AI model at the single `generate()` seam in `writer.js`.
- Connect a real WHOOP account through its API (the data model already matches).
- Add more pattern types (e.g., weather, meals) as the patient logs more.

---

*Receipts — your body's evidence, in plain sight. Built with Kiro for Hackachusetts.*
