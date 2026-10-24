# How we built Receipts with Kiro

**Live app:** https://melodic-bonbon-4f819b.netlify.app · **Repo:** https://github.com/aspatoreluke/Kiro-Project

We're a **non-coding team**. We didn't write the code; we directed Kiro to build it, and used
Kiro's structure (specs, steering, hooks, MCP, property tests) to stay in control of a health app
where mistakes matter. Our commit history shows the process step by step: every task is its own
commit, and every bug we caught is explained in the commit that fixed it.

---

## Kiro features we used

| Kiro feature | Where | What it did for us |
|---|---|---|
| **Spec** (requirements → design → tasks) | `.kiro/specs/receipts/` | 19 requirements, a design, 34 tasks. We approved each document in plain English before any code. |
| **Steering** (3 docs) | `.kiro/steering/` | `safety.md` (always on), `privacy.md` (always on), `accessibility.md` (loads only when screens, styles, or wording are edited). |
| **Hooks** (2) | `.kiro/hooks/` | No-diagnosis language check on every save; full test suite when core logic or an adapter is saved. |
| **MCP server** | `.kiro/settings/mcp.json` | Official `fetch` server, used to read Apple and WHOOP export docs while checking our adapters. |
| **Property-based testing** | `tests/*.props.test.js` | 25 properties, each run on hundreds of random messy inputs. Caught 3 real bugs. |
| **Autopilot** | the whole build | Kiro worked task by task, ran tests and a headless browser itself, and committed after each task. |
| **Powers** | not used | No power fit this project, and none were installed. We'd rather say so than force one in. |

---

## 1. Spec-driven development

`.kiro/specs/receipts/` holds three documents:

- **requirements.md:** user stories with testable acceptance criteria. v1 (Req 1–11) covered
  the app. v2 (Req 12–19) added wearable integration, live AI, property tests, and more Kiro
  features.
- **design.md:** the "how", with a table mapping every requirement to the file that handles it.
- **tasks.md:** the build checklist, each task tagged with its requirement and ticked off as it
  shipped.

The spec changed when *we* changed our minds, and the changes are recorded. Two examples: we
asked that patients choose their own symptoms (Req 1b), and we decided not to pay for an AI
(Req 16 now defaults to Gemini's free tier).

## 2. Steering: our rules, applied every time

- **safety.md:** never diagnose, never recommend treatment, always "compared to your own
  usual", "This is not a diagnosis — your clinician decides" on every brief, kind and calm
  language, no real health data.
- **privacy.md:** exports are read in the browser only, nothing persisted, no real data in the
  repo, only pattern numbers go to the AI, keys only in Netlify settings.
- **accessibility.md:** 8th-grade reading level, 18px+ text, 4.5:1 contrast, 44px tap targets,
  color never the only signal, screen-reader rules. Uses `fileMatch` inclusion, so it loads only
  when Kiro edits screens, styles, charts, or wording.

## 3. Hooks: automatic checks on save

- **No Diagnostic Language:** scans the app's text for diagnostic or prescriptive wording. Its
  first version flagged our own disclaimer; we taught it the difference.
- **Run Tests on Core Save:** saving `analysis.js`, `safety.js`, `datasource.js`, `ai.js`, an
  adapter, or the AI function runs all 57 tests.

While testing the hooks we found Kiro was opened on the folder *above* our repo, so hook
commands ran in the wrong place, and the language check "passed" while scanning nothing. Hooks
now always run from the repo, and the check refuses to pass if it can't find the app.

## 4. MCP: reading the real docs

We added the official **fetch** MCP server and a small client (`tools/mcp-fetch.js`) that starts
it from our MCP config and asks it for documentation pages. We used it to check our adapters:

- **Apple HealthKit docs:** confirmed the six sleep values (in bed, awake, and four "asleep"
  stages) and that HRV is SDNN in milliseconds. Our "count only time asleep" rule matched.
- **WHOOP export guide:** the export includes `sleeps.csv`, and **it lists naps as their own
  rows**. That meant a 20-minute nap could have replaced someone's main night of sleep. We fixed
  it and added a test.

Honest note: Kiro loads MCP servers when a session starts. This chat started before we added
it, so here we drove the server through our own MCP client. From the next session on, Kiro can
call it directly.

## 5. Wearable integration and the adapter design

The track is about wearable data, so we made it real:

- **One standard data model** (`js/adapters/standard-model.js`): every device converts into the
  same daily shape (resting HR, HRV, sleep, steps/strain, skin temp, cycle day). The pattern
  finder, charts, and brief only ever see that shape.
- **WHOOP adapter:** matches columns by meaning, since WHOOP renames them between versions.
- **Apple Health adapter:** real exports are huge (ours was **452 MB**). It reads them in 8 MB
  slices, keeps only six record types, ignores personal details such as date of birth, and
  never double counts steps when both an iPhone and an Apple Watch recorded them.
- **Missing data is said out loud:** our own Apple export had steps only (an iPhone without a
  watch). The app lists exactly which insights aren't available and why, instead of guessing.
- **Watch view:** tap a symptom on a smartwatch face and watch it appear on the timeline.

## 6. Privacy approach

Data stays on the device. Uploads are parsed in the browser and never saved. The AI receives only
pattern codes and numbers, and tests prove it: one sends a name and a fake "ignore your rules"
note and checks that neither reaches the AI. Real exports are blocked from Git, and the only tool
that touches a real export prints counts, never readings.

## 7. Live AI and its safety fallback

- A Netlify function (`netlify/functions/write.mjs`) builds the prompt on the server from
  whitelisted numbers and asks Gemini (free tier) to reword each pattern warmly.
- The browser shows templates instantly. AI text replaces them only if it arrives within
  **8 seconds** and each sentence passes **assertSafeText()** and a **numbers check** (no number
  the AI invented or changed). If anything fails, the template stays and nobody notices.
- AI text is labeled **"AI-written · checked for safety"**. The disclaimer and the doctor
  questions are never AI-written.

Live testing caught two problems that unit tests couldn't:

1. The first model "thought" too long and timed out. We switched to a faster one.
2. The AI sometimes paired correct numbers the wrong way ("12 days with big jumps" instead of
   *9 of 12*). Every number was real, so the numbers check couldn't catch it. Now the server
   hands the AI the exact fact sentence and asks it only to reword it.

## 8. Property-based testing, and what it caught

Instead of a few examples, each property runs on hundreds of random inputs: junk values, missing
metrics, cut-off files, odd sentences. 25 properties cover the safety guard, the pattern finder,
the data model, and both adapters.

| Caught | Why it mattered |
|---|---|
| The safety guard blocked **our own disclaimer** ("This is not a diagnosis") | Any AI text containing it was silently thrown away. |
| The guard blocked harmless **"you have logged 9 taps"** | Good wording was rejected. A new property proves a real diagnosis is still caught, even next to a disclaimer. |
| The baseline could be **negative** ("your usual rise of about -8 bpm") | Confusing text shown to patients. Now floored at 0. |

The adapter properties found no bugs. To make sure that wasn't luck, we **planted two bugs**
(adding iPhone + Watch steps together; dropping text between file slices). The properties caught
both, which also showed us one of our random-data generators was too weak, so we fixed it.

## Everything our checks caught

Specs, hooks, tests, the browser walk-through, and MCP each caught something:

1. Demo patterns didn't line up at first (example tests, v1).
2. The no-diagnosis hook flagged safe phrases (hook, v1).
3. The timeline crashed on uploads with no taps (headless-browser walk-through).
4. The AI timed out (live test).
5. The AI mis-paired numbers (live test).
6. The guard blocked our disclaimer (property test).
7. The guard blocked "you have logged" (property test).
8. The baseline could go negative (property test).
9. The hooks scanned nothing from the wrong folder (hook testing).
10. WHOOP naps could replace a night's sleep (MCP docs).

---

## Spec-driven development vs. vibe coding, from non-coders

**Vibe coding** is chatting "build me an app" and accepting what comes back. For us that would
have meant code we couldn't read and couldn't check. We'd never know whether it diagnosed someone
by accident.

**Spec-driven development** let us do the part we *can* do well: decide what the product should
do, in plain English, before anything was built.

- **We made the decisions.** Requirements were where we said "patients choose their own
  symptoms", "never diagnose", "don't spend money". Kiro turned those into code.
- **We could check the work without reading code.** Every task points to a requirement, and the
  tests are written in plain sentences ("steps are never double counted").
- **Changing our minds was cheap.** We updated the spec first, then the code followed.
- **Rules stuck.** Steering meant we didn't have to repeat "be kind, don't diagnose" every time.
  Hooks re-checked it on every save.
- **It's slower at the start.** We spent the first stretch on documents instead of a demo. It
  paid off: when we added wearable uploads and live AI hours later, nothing earlier broke, and
  the checks caught ten real problems.

For a health app built by people who can't code, that's the difference between hoping it's safe
and being able to show it is.

---

*Receipts — your body's evidence, in plain sight. Not a diagnosis; your clinician decides.*
