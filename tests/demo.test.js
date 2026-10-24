/* Example-based checks: Maya's demo must keep working exactly as before,
   now that everything reads through the datasource. */
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./load");

test("demo dataset loads through the datasource", () => {
  const g = load();
  const d = g.RECEIPTS_DATASOURCE.get();
  assert.strictEqual(d.source, "demo");
  assert.strictEqual(d.daily.length, 60);
  assert.ok(d.symptomTaps.length > 10);
  assert.ok(d.availability.hrv_ms && d.availability.sleep_hours && d.availability.cycle_day);
});

test("demo still finds the orthostatic and short-sleep patterns", () => {
  const g = load();
  const ids = g.RECEIPTS_ANALYSIS.runDetective().map(f => f.id);
  assert.ok(ids.includes("orthostatic"), "orthostatic missing: " + ids);
  assert.ok(ids.includes("shortsleep"), "shortsleep missing: " + ids);
});

test("every generated demo sentence passes the safety guard", () => {
  const g = load();
  const A = g.RECEIPTS_ANALYSIS, W = g.RECEIPTS_WRITER, S = g.RECEIPTS_SAFETY;
  const findings = A.runDetective();
  findings.forEach(f => assert.deepStrictEqual(S.scan(W.writeFinding(f)), []));
  assert.deepStrictEqual(S.scan(W.writeTodayMessage(A.todayScore())), []);
  ["doctor", "patient"].forEach(aud => {
    const b = W.writeBrief(findings, A.todayScore(), aud);
    assert.match(b.disclaimer, /not a diagnosis/);
  });
});

test("timeline summary finds the seeded links in Maya's data, in plain safe words", () => {
  const g = load();
  const A = g.RECEIPTS_ANALYSIS, W = g.RECEIPTS_WRITER, S = g.RECEIPTS_SAFETY, SY = g.RECEIPTS_SYMPTOMS;
  const cs = A.correlations();
  const has = (sym, field, dir) => cs.some(c => c.symptom === sym && c.field === field && c.direction === dir);
  assert.ok(has("fatigue", "sleep_hours", "low"), "fatigue + short sleep");
  assert.ok(has("nausea", "resting_hr_bpm", "high"), "nausea + high resting HR");
  cs.forEach(c => {
    const t = W.writeCorrelation(c, SY.lookup(c.symptom).label);
    assert.deepStrictEqual(S.scan(t), []);
    assert.match(t, /often came/);
  });
});

test("a logged tap lands on the latest day so it appears on the timeline", () => {
  const g = load();
  const DS = g.RECEIPTS_DATASOURCE;
  const before = DS.get().symptomTaps.length;
  const tap = DS.logTap("dizzy");
  const d = DS.get();
  assert.strictEqual(d.symptomTaps.length, before + 1);
  assert.strictEqual(tap.date, d.daily[d.daily.length - 1].date);
  assert.strictEqual(tap.live, true);
});
