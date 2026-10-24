# How we built Receipts with Kiro

**Live app:** https://aspatoreluke.github.io/Kiro-Project/ · **With live AI:** https://melodic-bonbon-4f819b.netlify.app · **Repo:** https://github.com/aspatoreluke/Kiro-Project

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
| **Kiro CLI** + **custom agent** | `.kiro/agents/plain-language-reviewer.json` | Ran a read-only reviewer headless against every sentence the app shows. 3 rounds, real fixes. |
| **Power** | Netlify Deployment (installed with `kiro-cli powers install`) | Guided a review of our Netlify setup → security headers and script integrity hashes. |

---

## Which Kiro tools we used, and how they differed

We used **two**: the **Kiro IDE** and the **Kiro CLI**. We didn't try Kiro Web or Crew.

**Kiro IDE: where we built everything.** It's where we talked, approved the spec, and watched
the agent work. As non-coders, being able to see each file change, read the spec next to the
chat, and stop or redirect at any moment was what made it feel safe. Kiro (autopilot) ran our
tests, a headless browser, Git, and the MCP server itself.

**Kiro CLI: one focused, repeatable job.** We installed it near the end
(`curl -fsSL https://cli.kiro.dev/install | bash`, then `kiro-cli login` with GitHub) for a task
that didn't need a conversation:

- We made a **custom agent** (`.kiro/agents/plain-language-reviewer.json`). It's read-only, and
  its "resources" are our accessibility and safety steering files plus a file of every sentence
  the app shows.
- We ran it headless, with no chat window:
  `kiro-cli chat --no-interactive --agent plain-language-reviewer --trust-tools=fs_read "Review docs/app-copy.txt"`.
- It answered in about 15 seconds with a table: sentence, rule broken, suggested rewrite.
- Over 3 rounds it caught real issues: "bpm" on patient screens, a 42-word sentence, and a
  **72-word "pacing day" message** that our demo never shows, so none of us had read it. Log in
  [`docs/plain-language-review.md`](./docs/plain-language-review.md).

| | Kiro IDE | Kiro CLI |
|---|---|---|
| Best for | Building: back-and-forth, approving specs, watching changes | One job, the same way every time; scripts and CI |
| How it felt | A teammate you talk to | A command you run |
| What it shared | the same `.kiro/` folder: steering, agents, MCP config, hooks | the same `.kiro/` folder |
| Safety controls | approve as you go | `--trust-tools=fs_read`: this agent could only read |
| Unique to it, for us | spec panes, diffs, autopilot | custom agent run headless; installing a power from the terminal |

The surprise: because both read the same `.kiro/` folder, the steering we'd written for the IDE
became the CLI reviewer's rulebook with no extra work. The same agent could run on every pull
request in CI.

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

**The strategy that made the biggest difference: every steering rule is concrete enough to
check, and gets a check.** Our first instinct was rules like "be careful with medical
language". That's a vibe, and neither Kiro nor we could tell when it was broken. So we rewrote
each rule as something testable, then paired it with an automatic check:

| Steering rule (in words) | What enforces it automatically |
|---|---|
| "Never diagnose or recommend treatment" (safety.md) | `assertSafeText()` on every sentence, the no-diagnosis hook on every save, 7 safety properties |
| "Include the exact note: This is not a diagnosis — your clinician decides" | fixed string in every brief (never AI-written), checked in tests |
| "Only pattern codes and numbers go to the AI" (privacy.md) | whitelist on both sides, a test that sends a name and an "ignore your rules" note and checks neither arrives |
| "Never invent values; missing stays missing" | the data model's `null` + availability flags, 3 "never invents" properties |
| "Tap targets at least 44px, no sideways scroll at 390px" (accessibility.md) | the headless-browser walk-through measures both |

Steering made Kiro write it right the first time most of the time; the checks caught the times
it didn't. The second thing that helped was **inclusion modes**: safety and privacy are
always-on because they're non-negotiable, while accessibility loads only for UI and wording work,
so Kiro's context stays focused on the task at hand.

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

## 4b. Kiro powers: Netlify Deployment

We looked through the power catalog for a real fit, not a badge. Most powers are for stacks we
don't use (AWS, databases, payments). There was nothing for accessibility, health data, or our
test tools. One fit exactly: **Netlify Deployment** (by Netlify), since we deploy on Netlify.

- **Installed** with the Kiro CLI: `kiro-cli powers install netlify-deployment`.
- **Used** in a headless CLI run that asked for a review of `netlify.toml`, our AI function, and
  `index.html` against Netlify best practices, without deploying or editing anything.
- **What we applied:**
  - A strict **Content Security Policy**: only our files, the chart library's CDN, and our own
    AI function may load. No third-party scripts, and no embedding the app in other sites.
  - `X-Frame-Options`, `nosniff`, `no-referrer`, and a `Permissions-Policy` that turns off
    camera, microphone, and location.
  - **Integrity hashes** on Chart.js and JSZip, so a tampered CDN copy is refused.
- **What we declined:** year-long "immutable" caching. Our file names don't change between
  versions, so it would keep old safety wording in people's browsers.
- **What the policy caught right away:** Netlify adds a "Powered by Netlify" badge script to free
  sites. Our new policy blocked it, exactly as designed. We turned the badge off rather than
  loosening the policy, since a health app shouldn't carry third-party scripts.

Honest notes:

- The power's own guide is mostly about deploying with the Netlify CLI and keeping secrets in
  environment variables, which we already did. The header advice came from the Kiro CLI agent
  working with the power loaded, so we checked every change ourselves and verified it on the
  live site.
- This IDE chat only picks up powers when a session starts, so the CLI is where we used it.

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

## 5b. Today screen: "Echoes"

Most wearables give you a readiness score. Receipts does something else: it compares this
morning's readings with the mornings before **your own** past symptom days, and tells you in
plain words what to keep an eye out for. The evidence is your own history.

For Maya, it says "Today looks a lot like the mornings before your last 10 fatigue days." Below
that are cards such as "Your resting heart rate is 72, above your usual 62. 8 of your 11 logged
nausea days started with a resting heart rate this high."

Everything is generated from that person's data. Someone else, with custom "Migraine" and
"Hives" symptoms and no sleep data, gets a different headline about their migraines, citing
their HRV. It uses only the metrics their device recorded, and a match must beat chance.

The wording only describes what happened before. It never says "you will" or "likely", and a
property test checks that across hundreds of random datasets. Tapping a date jumps to that day
on the timeline.

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

**Which requirements we enabled PBT for.** We chose the requirements where one wrong output harms
trust or safety, and where hand-picked examples can't cover the space: any sentence, any messy
export. The properties are listed in the spec (design.md, "Correctness properties") and each
test names the requirement it validates.

| Requirement | Properties (each run 200–300×) |
|---|---|
| **Req 8 Safety** (never diagnose or prescribe; disclaimer on every brief) | "you have [condition]" always blocked · medication names always blocked, any case · "This is not a diagnosis" always allowed · "you have logged…" allowed · a disclaimer can't sneak a diagnosis through · plain pattern wording never blocked · whatever goes in, `assertSafeText` output is safe |
| **Req 3 Trigger Detective** (own baseline; drop weak patterns) | baseline never NaN or negative · baseline is the person's own middle value (shift all readings +5 → baseline +5) · 0–3 findings, strongest first, strengths in [0, 1] |
| **Req 5.3 / 14.4** (no section for missing data) | a finding is never reported for a metric the data doesn't have |
| **Req 4 Early warning** | Today score in [0, 1], using only signals that exist |
| **Req 7.3 + 8** (all generated text is safe) | every sentence from any dataset passes the guard and never shows "NaN" or "undefined" |
| **Req 13 Adapters** (one standard model; tolerate messy rows; never invent) | data model always full-shape and in range · cleaning is stable · CSV round-trips commas, quotes, line breaks · CSV never crashes · WHOOP always standard, whatever columns · WHOOP never reports steps or cycle · column order doesn't matter · Apple always standard · Apple never invents a metric · never double counts iPhone + Watch steps · cut-off or garbage files never crash, date of birth never kept |
| **Req 14.1** (huge files read on-device in slices) | slicing a file anywhere gives the same result as reading it whole |

Unit tests check the cases we thought of. Properties found the ones we didn't: our own disclaimer
being blocked, and the negative baseline.

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
11. A 72-word "pacing day" sentence no one had seen, plus jargon on patient screens (CLI reviewer agent).
12. No security headers on a public health app (Netlify power review).

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
  the checks caught twelve real problems.

For a health app built by people who can't code, that's the difference between hoping it's safe
and being able to show it is.

---

*Receipts — your body's evidence, in plain sight. Not a diagnosis; your clinician decides.*
