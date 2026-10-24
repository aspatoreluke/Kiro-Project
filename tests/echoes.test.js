/* Tests for the Today screen's "Echoes": compare today with the mornings
   before the person's own past symptom days. Requirement 20. */
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./load");

function words(g, ds, labels) {
  const A = g.RECEIPTS_ANALYSIS, W = g.RECEIPTS_WRITER, S = g.RECEIPTS_SAFETY;
  const labelFor = id => (labels && labels[id]) || g.RECEIPTS_SYMPTOMS.lookup(id).label;
  const e = A.echoes(ds);
  const headline = W.writeEchoHeadline(e, labelFor);
  const cards = e.cards.map(c => W.writeEchoCard(c, labelFor));
  [headline, ...cards.map(c => c.text)].forEach(t => {
    assert.deepStrictEqual(S.scan(t), [], "unsafe: " + t);
    assert.ok(!/\byou will\b|\blikely\b|\bpredict/i.test(t), "predictive wording: " + t);
    assert.ok(!/NaN|undefined|null/.test(t), "broken text: " + t);
  });
  return { e, headline, cards };
}

// A second person with different (custom) symptoms: "Migraine" after low HRV,
// "Hives" after high resting heart rate. 40 days, no sleep data at all.
function otherPerson(g, { todayHrv = 30, todayRhr = 64 } = {}) {
  const raw = [];
  const migraineDays = new Set([3, 8, 14, 19, 25, 31]);
  const hivesDays = new Set([5, 11, 17, 23, 29, 35]);
  for (let i = 0; i < 40; i++) {
    const date = new Date(Date.UTC(2025, 6, 1) + i * 86400000).toISOString().slice(0, 10);
    const wobble = (i * 7) % 5;
    raw.push({ date,
      hrv_ms: migraineDays.has(i) ? 30 + wobble : 55 + wobble,
      resting_hr_bpm: hivesDays.has(i) ? 76 + (wobble % 2) : 62 + (wobble % 3) });
  }
  raw.push({ date: "2025-08-10", hrv_ms: todayHrv, resting_hr_bpm: todayRhr }); // "today"
  const ds = g.RECEIPTS_MODEL.buildDataset(raw, { source: "test" });
  ds.symptomTaps = [];
  raw.forEach((d, i) => {
    if (migraineDays.has(i)) ds.symptomTaps.push({ date: d.date, symptom_id: "custom_migraine_1" });
    if (hivesDays.has(i)) ds.symptomTaps.push({ date: d.date, symptom_id: "custom_hives_2" });
  });
  return ds;
}
const OTHER_LABELS = { custom_migraine_1: "Migraine", custom_hives_2: "Hives" };

test("Maya: a clear Echo match plus at least 2 'keep an eye out' cards", () => {
  const g = load();
  const { e, headline, cards } = words(g);
  assert.strictEqual(e.state, "echo");
  assert.match(headline, /Today looks a lot like the mornings before .*fatigue days\./);
  assert.ok(e.headline.dates.length >= 2);
  assert.ok(cards.length >= 2 && cards.length <= 3);
  assert.ok(cards.some(c => /Nausea/.test(c.title)));
});

test("a different person with custom symptoms gets a different headline and cards", () => {
  const g = load();
  const { e, headline, cards } = words(g, otherPerson(g), OTHER_LABELS);
  assert.strictEqual(e.state, "echo");
  assert.match(headline, /6 migraine days/);
  assert.ok(cards.some(c => c.title === "Migraine" && /HRV/.test(c.text)));
  assert.ok(!/fatigue|nausea/i.test(headline + cards.map(c => c.text).join(" ")));
});

test("works with a missing metric: no sleep in the data means no sleep wording", () => {
  const g = load();
  const { cards } = words(g, otherPerson(g), OTHER_LABELS);
  assert.ok(cards.every(c => !/slept|sleep/i.test(c.text)));
});

test("too few logs: a kind 'keep logging' message", () => {
  const g = load();
  const ds = otherPerson(g);
  ds.symptomTaps = ds.symptomTaps.slice(0, 2);
  const { e, headline, cards } = words(g, ds, OTHER_LABELS);
  assert.strictEqual(e.state, "few-logs");
  assert.match(headline, /Keep logging/);
  assert.strictEqual(cards.length, 0);
});

test("nothing unusual today: 'Today looks like your normal.'", () => {
  const g = load();
  const { e, headline, cards } = words(g, otherPerson(g, { todayHrv: 56, todayRhr: 63 }), OTHER_LABELS);
  assert.strictEqual(e.state, "normal");
  assert.strictEqual(headline, "Today looks like your normal.");
  assert.strictEqual(cards.length, 0);
});

test("today's own taps are never counted as a past episode", () => {
  const g = load();
  const DS = g.RECEIPTS_DATASOURCE;
  const before = g.RECEIPTS_ANALYSIS.echoes().headline.episodes;
  DS.logTap("fatigue"); DS.logTap("fatigue");
  assert.strictEqual(g.RECEIPTS_ANALYSIS.echoes().headline.episodes, before);
});
