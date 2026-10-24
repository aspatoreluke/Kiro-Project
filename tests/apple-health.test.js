/* Example-based checks for the Apple Health adapter, using a small
   SYNTHETIC export (tests/fixtures/sample-apple-health.xml). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./load");

const SAMPLE = fs.readFileSync(path.join(__dirname, "fixtures/sample-apple-health.xml"), "utf8");

function byDate(ds) { const m = {}; ds.daily.forEach(d => { m[d.date] = d; }); return m; }

test("detects an Apple Health export, and not other files", () => {
  const A = load().RECEIPTS_ADAPTER_APPLE;
  assert.strictEqual(A.detect(SAMPLE), true);
  assert.strictEqual(A.detect("Cycle start time,Recovery score %\n"), false);
});

test("iPhone + Watch steps are not double counted (keeps the bigger device total)", () => {
  const A = load().RECEIPTS_ADAPTER_APPLE;
  const d = byDate(A.parseText(SAMPLE));
  // iPhone 3000 + 2000 = 5000, Watch 4800 -> 5000 (not 9800)
  assert.strictEqual(d["2025-10-01"].steps, 5000);
});

test("sleep counts only time asleep, filed under the wake-up day", () => {
  const A = load().RECEIPTS_ADAPTER_APPLE;
  const d = byDate(A.parseText(SAMPLE));
  // 4h core + 3h deep = 7h; the 30 min awake and the iPhone "in bed" don't count.
  assert.strictEqual(d["2025-10-02"].sleep_hours, 7);
});

test("daily averages for resting HR and HRV; bad readings skipped", () => {
  const A = load().RECEIPTS_ADAPTER_APPLE;
  const ds = A.parseText(SAMPLE);
  const d = byDate(ds);
  assert.strictEqual(d["2025-10-01"].resting_hr_bpm, 61);
  assert.strictEqual(d["2025-10-01"].hrv_ms, 45);   // (40 + 50) / 2
  assert.strictEqual(d["2025-10-02"].steps, 6100);  // "not-a-number" row ignored
  assert.strictEqual(ds.hrvMethod, "SDNN");
});

test("period days become cycle day 1, 2, ...", () => {
  const A = load().RECEIPTS_ADAPTER_APPLE;
  const d = byDate(A.parseText(SAMPLE));
  assert.strictEqual(d["2025-10-01"].cycle_day, null);
  assert.strictEqual(d["2025-10-02"].cycle_day, 1);
  assert.strictEqual(d["2025-10-03"].cycle_day, 2);
});

test("works the same when the file arrives in tiny pieces (like a huge file read in slices)", () => {
  const A = load().RECEIPTS_ADAPTER_APPLE;
  const whole = A.parseText(SAMPLE);
  const p = A.createParser();
  for (let i = 0; i < SAMPLE.length; i += 37) p.push(SAMPLE.slice(i, i + 37));
  const pieces = p.finish();
  assert.deepStrictEqual(pieces.daily, whole.daily);
});

test("ignores types Receipts doesn't use (raw heart rate, workouts, date of birth)", () => {
  const A = load().RECEIPTS_ADAPTER_APPLE;
  const ds = A.parseText(SAMPLE);
  assert.ok(!JSON.stringify(ds).includes("2000-01-01"));
  assert.ok(!JSON.stringify(ds).includes("88"));
});
