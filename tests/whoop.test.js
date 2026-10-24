/* Example-based checks for the WHOOP adapter, using a small SYNTHETIC
   sample file (tests/fixtures/sample-physiological-cycles.csv). It's
   deliberately messy: quoted numbers, a blank row, a bad date, and a
   night with in-bed time but no asleep time. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./load");

const SAMPLE = fs.readFileSync(path.join(__dirname, "fixtures/sample-physiological-cycles.csv"), "utf8");

test("detects a WHOOP export, and not other CSVs", () => {
  const W = load().RECEIPTS_ADAPTER_WHOOP;
  assert.strictEqual(W.detect(SAMPLE), true);
  assert.strictEqual(W.detect("date,steps\n2025-01-01,5000\n"), false);
  assert.strictEqual(W.detect(""), false);
});

test("maps WHOOP columns into the standard model", () => {
  const W = load().RECEIPTS_ADAPTER_WHOOP;
  const ds = W.parse(SAMPLE);
  assert.strictEqual(ds.source, "whoop");
  // 4 good rows, filed under the morning you woke up.
  assert.deepStrictEqual(ds.daily.map(d => d.date), ["2025-09-02", "2025-09-03", "2025-09-04", "2025-09-05"]);
  const first = ds.daily[0];
  assert.strictEqual(first.recovery_score, 71);
  assert.strictEqual(first.hrv_ms, 64);
  assert.strictEqual(first.resting_hr_bpm, 58);
  assert.strictEqual(first.sleep_hours, 7.5); // 452 min
  assert.strictEqual(first.steps, null);       // WHOOP doesn't export steps
  // Quoted numbers like "66" still read correctly.
  assert.strictEqual(ds.daily[2].recovery_score, 66);
});

test("never invents values: in-bed time is not counted as sleep", () => {
  const W = load().RECEIPTS_ADAPTER_WHOOP;
  const last = W.parse(SAMPLE).daily.slice(-1)[0];
  assert.strictEqual(last.sleep_hours, null);
  assert.strictEqual(last.day_strain, 4.2);
});

test("availability flags reflect what's really in the file", () => {
  const W = load().RECEIPTS_ADAPTER_WHOOP;
  const a = W.parse(SAMPLE).availability;
  assert.strictEqual(a.hrv_ms, true);
  assert.strictEqual(a.recovery_score, true);
  assert.strictEqual(a.steps, false);
  assert.strictEqual(a.cycle_day, false);
});

test("naps in sleeps.csv never replace the main night's sleep", () => {
  const W = load().RECEIPTS_ADAPTER_WHOOP;
  const sleeps = [
    "Cycle start time,Sleep onset,Wake onset,Sleep performance %,Asleep duration (min),In bed duration (min),Nap",
    "2025-09-01 22:40:00,2025-09-01 22:40:00,2025-09-02 06:50:00,88,450,490,false",
    "2025-09-01 22:40:00,2025-09-02 14:00:00,2025-09-02 14:25:00,30,22,25,true"
  ].join("\n");
  const day = W.parse(sleeps).daily.find(d => d.date === "2025-09-02");
  assert.strictEqual(day.sleep_hours, 7.5);
  // Even with no Nap column, the longest sleep that morning wins.
  const noNapCol = sleeps.replace(/,Nap$/m, "").replace(/,(true|false)$/gm, "");
  assert.strictEqual(W.parse(noNapCol).daily.find(d => d.date === "2025-09-02").sleep_hours, 7.5);
});

test("the whole app runs on WHOOP data", () => {
  const g = load();
  const ds = g.RECEIPTS_ADAPTER_WHOOP.parse(SAMPLE);
  g.RECEIPTS_DATASOURCE.useUploaded(ds);
  const base = g.RECEIPTS_ANALYSIS.computeBaseline();
  assert.ok(base.hrv > 0 && base.restingHr > 0);
  assert.ok(Array.isArray(g.RECEIPTS_ANALYSIS.runDetective()));
  const status = g.RECEIPTS_ANALYSIS.insightStatus();
  assert.strictEqual(status.find(s => s.id === "orthostatic").available, false);
});
