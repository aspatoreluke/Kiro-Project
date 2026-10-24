/* Tests for js/ai.js — the browser side of the live AI step.
   The network is faked; no real AI is called. */
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./load");

function setup() {
  const g = load();
  // ai.js isn't in the default load order yet in older checkouts; load it explicitly.
  delete require.cache[require.resolve("../js/ai.js")];
  require("../js/ai.js");
  g.RECEIPTS_AI.reset();
  const A = g.RECEIPTS_ANALYSIS;
  return { g, AI: g.RECEIPTS_AI, W: g.RECEIPTS_WRITER, findings: A.runDetective(), today: A.todayScore(), days: 60 };
}
const reply = (result, status = 200) => async () => new Response(JSON.stringify({ provider: "gemini", result }), { status });

function goodResult(findings) {
  const f = {};
  findings.forEach(x => {
    f[x.kind] = x.kind === "orthostatic"
      ? { patient: `On ${x.facts.bigJumpDays} of ${x.facts.totalDizzyDays} dizzy days, your heart rate climbed about ${x.facts.avgJump} bpm after standing, more than your usual.`,
          doctor: `On ${x.facts.bigJumpDays} of ${x.facts.totalDizzyDays} dizzy days the patient's heart rate rose about ${x.facts.avgJump} bpm on standing, above their own baseline.` }
      : { patient: "Your crash days tended to follow shorter nights than you usually get.",
          doctor: "The patient's crash days tended to follow shorter sleep than their own usual." };
  });
  return {
    findings: f,
    today: "Your signals look close to your usual today. Go at whatever pace feels right.",
    doctorIntro: "These are patterns from the patient's own wearable, compared with their own baseline.",
    patientIntro: "Here's what your own data has been showing, in plain words.",
    patientQuestions: ["What could explain these patterns?", "Is there a simple check we could try?", "What should I keep tracking?"]
  };
}

test("only pattern kinds and numbers are sent — no dates, labels, or names", () => {
  const { AI, findings, today, days } = setup();
  const payload = AI.buildPayload(findings, today, days);
  const sent = JSON.stringify(payload);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(sent), "contains a date");
  // Every string VALUE must be one of our fixed codes (field names don't count).
  const strings = [];
  JSON.parse(sent, (k, v) => { if (typeof v === "string") strings.push(v); return v; });
  const CODES = ["orthostatic", "shortsleep", "cycle", "recovery", "hrv", "sleep", "restingHr"];
  strings.forEach(s => assert.ok(CODES.includes(s), "unexpected text sent: " + s));
  assert.ok(!/Maya/.test(sent));
});

test("good AI wording is used and labeled as AI", async () => {
  const { AI, W, findings, today, days } = setup();
  await AI.refresh(findings, today, days, reply(goodResult(findings)));
  assert.strictEqual(AI.getState().status, "done");
  const f = W.writeFindingRich(findings.find(x => x.kind === "orthostatic"), "patient");
  assert.strictEqual(f.ai, true);
  assert.match(f.text, /heart rate climbed/);
  const brief = W.writeBrief(findings, today, "patient");
  assert.strictEqual(brief.introAi, true);
  assert.strictEqual(brief.questionsAi, true);
  assert.match(brief.disclaimer, /not a diagnosis/); // disclaimer is never AI-written
});

test("unsafe AI wording is thrown away and the template is used instead", async () => {
  const { AI, W, findings, today, days } = setup();
  const bad = goodResult(findings);
  bad.findings.orthostatic.patient = "This looks like POTS, you have POTS and should take midodrine.";
  bad.today = "You have a condition. Take ibuprofen.";
  await AI.refresh(findings, today, days, reply(bad));
  const f = W.writeFindingRich(findings.find(x => x.kind === "orthostatic"), "patient");
  assert.strictEqual(f.ai, false);
  assert.match(f.text, /On \d+ of \d+ days you felt dizzy/);
  assert.strictEqual(W.writeTodayMessageRich(today).ai, false);
  assert.ok(AI.getState().rejected >= 2);
});

test("AI wording with an invented number is thrown away", async () => {
  const { AI, W, findings, today, days } = setup();
  const bad = goodResult(findings);
  bad.findings.orthostatic.patient = "On 11 of 12 dizzy days your heart rate climbed about 47 bpm.";
  await AI.refresh(findings, today, days, reply(bad));
  assert.strictEqual(W.writeFindingRich(findings.find(x => x.kind === "orthostatic"), "patient").ai, false);
});

test("if the AI is down or not set up, everything falls back to templates", async () => {
  const { AI, W, findings, today, days } = setup();
  await AI.refresh(findings, today, days, async () => new Response(JSON.stringify({ error: "no-key" }), { status: 503 }));
  assert.strictEqual(AI.getState().status, "failed");
  assert.strictEqual(W.writeBrief(findings, today, "doctor").introAi, false);
  assert.strictEqual(W.writeTodayMessageRich(today).ai, false);
});

test("a network error also falls back quietly", async () => {
  const { AI, W, findings, today, days } = setup();
  await AI.refresh(findings, today, days, async () => { throw new TypeError("Failed to fetch"); });
  assert.strictEqual(AI.getState().status, "failed");
  assert.strictEqual(W.writeFindingRich(findings[0], "patient").ai, false);
});

test("the browser gives up after 8 seconds", async () => {
  const { AI, findings, today, days } = setup();
  assert.strictEqual(AI.TIMEOUT_MS, 8000);
  // Fake a request that only ends when aborted, and fast-forward the timer.
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => realSetTimeout(fn, ms === 8000 ? 10 : ms);
  try {
    await AI.refresh(findings, today, days, (url, opts) => new Promise((_, rej) => {
      opts.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); });
    }));
  } finally { global.setTimeout = realSetTimeout; }
  assert.strictEqual(AI.getState().status, "failed");
  assert.strictEqual(AI.getState().reason, "timeout");
});
