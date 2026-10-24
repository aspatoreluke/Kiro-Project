/* Property-based tests for js/analysis.js and the standard data model.
   Validates: Requirements 3, 4, 13, 14.4 and 17.2. */
const test = require("node:test");
const { fc, FIELDS, messyRawDays, isoDate } = require("./arbitraries");
const { load } = require("./load");

const g = load();
const MODEL = g.RECEIPTS_MODEL, A = g.RECEIPTS_ANALYSIS, DS = g.RECEIPTS_DATASOURCE;
const S = g.RECEIPTS_SAFETY, W = g.RECEIPTS_WRITER;
const RUNS = { numRuns: 300 };
const SYMPTOMS = ["dizzy", "fatigue", "pain", "nausea", "brain_fog"];

// A full random dataset: messy days + random taps + random standing events.
const dataset = messyRawDays.chain(raw => {
  const ds = MODEL.buildDataset(raw, { source: "test" });
  DS.annotateCycle(ds.daily);
  const dates = ds.daily.map(d => d.date);
  const pickDate = dates.length ? fc.constantFrom(...dates) : isoDate;
  return fc.record({
    taps: fc.array(fc.record({ date: pickDate, symptom_id: fc.constantFrom(...SYMPTOMS) }), { maxLength: 40 }),
    stands: fc.array(fc.record({ date: pickDate, hr_jump_bpm: fc.oneof(fc.integer({ min: -10, max: 70 }), fc.constant(null)) }), { maxLength: 40 })
  }).map(({ taps, stands }) => ({ ...ds, symptomTaps: taps, standingEvents: stands })); // new object each time
});

const okNumber = v => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);

test("PROPERTY: the baseline is never NaN or negative — each value is a real number or 'not available'", () => {
  fc.assert(fc.property(dataset, ds => {
    const b = A.computeBaseline(ds);
    return Object.values(b).every(okNumber);
  }), RUNS);
});

test("PROPERTY: the baseline is the person's OWN middle value (shift every reading by +5 → baseline moves +5)", () => {
  const hrDays = fc.array(fc.record({ date: isoDate, resting_hr_bpm: fc.integer({ min: 40, max: 120 }) }), { minLength: 3, maxLength: 60 });
  fc.assert(fc.property(hrDays, raw => {
    const a = A.computeBaseline(MODEL.buildDataset(raw)).restingHr;
    const b = A.computeBaseline(MODEL.buildDataset(raw.map(d => ({ ...d, resting_hr_bpm: d.resting_hr_bpm + 5 })))).restingHr;
    return Math.abs((b - a) - 5) <= 1; // ±1 for rounding
  }), RUNS);
});

test("PROPERTY: Trigger Detective returns 0–3 findings, strongest first, strengths between 0 and 1", () => {
  fc.assert(fc.property(dataset, ds => {
    const f = A.runDetective(ds);
    if (f.length > 3) return false;
    for (let i = 0; i < f.length; i++) {
      if (!(f[i].strength >= 0 && f[i].strength <= 1)) return false;
      if (i && f[i].strength > f[i - 1].strength) return false;
    }
    return true;
  }), RUNS);
});

test("PROPERTY: a finding is never reported for a metric the data doesn't have", () => {
  fc.assert(fc.property(dataset, ds => {
    const ids = A.runDetective(ds).map(f => f.id);
    if (ids.includes("shortsleep") && !ds.availability.sleep_hours) return false;
    if (ids.includes("cycle") && !ds.availability.cycle_day) return false;
    if (ids.includes("orthostatic") && !ds.standingEvents.length) return false;
    return true;
  }), RUNS);
});

test("PROPERTY: the Today score is between 0 and 1 and only uses signals that exist", () => {
  fc.assert(fc.property(dataset, ds => {
    const t = A.todayScore(ds);
    const known = ["recovery", "hrv", "sleep", "restingHr"];
    return t.score >= 0 && t.score <= 1 && typeof t.pacing === "boolean" &&
      t.checked.every(k => known.includes(k)) &&
      t.reasons.every(r => t.checked.includes(r.k));
  }), RUNS);
});

test("PROPERTY: every sentence the app writes from any data passes the safety guard", () => {
  fc.assert(fc.property(dataset, ds => {
    const findings = A.runDetective(ds);
    const today = A.todayScore(ds);
    const texts = findings.map(f => W.writeFinding(f)).concat([W.writeTodayMessage(today)]);
    ["doctor", "patient"].forEach(aud => {
      const b = W.writeBrief(findings, today, aud);
      texts.push(b.intro, b.disclaimer, ...b.patterns.map(p => p.sentence), ...b.patientQuestions);
    });
    return texts.every(t => S.scan(t).length === 0) && texts.every(t => !/NaN|undefined|null/.test(t));
  }), RUNS);
});

test("PROPERTY: the standard model always has the full shape, with only in-range values", () => {
  fc.assert(fc.property(messyRawDays, raw => {
    const ds = MODEL.buildDataset(raw);
    const dates = ds.daily.map(d => d.date);
    const sorted = dates.every((d, i) => !i || dates[i - 1] < d); // sorted AND no duplicates
    const shapeOk = ds.daily.every(d => FIELDS.every(f => {
      const v = d[f];
      if (v === null) return true;
      const [min, max] = MODEL.RANGES[f];
      return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
    }));
    const availOk = FIELDS.every(f =>
      ds.availability[f] === (ds.daily.filter(d => d[f] !== null).length >= MODEL.MIN_DAYS_AVAILABLE));
    return sorted && shapeOk && availOk && ds.daily.length <= 90;
  }), RUNS);
});

test("PROPERTY: cleaning is stable — running clean data through the model again changes nothing", () => {
  fc.assert(fc.property(messyRawDays, raw => {
    const once = MODEL.buildDataset(raw).daily;
    const twice = MODEL.buildDataset(once).daily;
    return JSON.stringify(once) === JSON.stringify(twice);
  }), RUNS);
});
