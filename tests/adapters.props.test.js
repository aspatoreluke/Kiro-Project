/* Property-based tests for the device adapters (CSV reader, WHOOP,
   Apple Health). They generate random, messy exports and check rules
   that must always hold.
   Validates: Requirements 13 (adapters), 14 (missing metrics), 17.2. */
const test = require("node:test");
const { fc, FIELDS, isoDate } = require("./arbitraries");
const { load } = require("./load");

const g = load();
const CSV = g.RECEIPTS_CSV, WHOOP = g.RECEIPTS_ADAPTER_WHOOP, APPLE = g.RECEIPTS_ADAPTER_APPLE, MODEL = g.RECEIPTS_MODEL;
const RUNS = { numRuns: 200 };

// Every adapter must hand back the standard model: full shape, in range, sorted, honest flags.
function isStandard(ds) {
  if (!ds || !Array.isArray(ds.daily) || typeof ds.availability !== "object") return false;
  const dates = ds.daily.map(d => d.date);
  if (!dates.every((d, i) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!i || dates[i - 1] < d))) return false;
  const inRange = ds.daily.every(d => FIELDS.every(f => {
    const v = d[f];
    if (v === null) return true;
    const [min, max] = MODEL.RANGES[f];
    return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  }));
  const honest = FIELDS.every(f =>
    ds.availability[f] === (ds.daily.filter(d => d[f] !== null).length >= MODEL.MIN_DAYS_AVAILABLE));
  return inRange && honest;
}

// ---------- CSV reader ----------
const cell = fc.oneof(
  fc.string({ maxLength: 8 }),
  fc.constantFrom('a,b', 'say "hi"', "line\nbreak", "", " spaced ", "12.5", "\r\n")
);
function toCsv(rows) {
  return rows.map(r => r.map(c => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
}

test("PROPERTY: CSV reader gets back exactly the cells that were written (commas, quotes, line breaks)", () => {
  const rows = fc.integer({ min: 1, max: 5 }).chain(w =>
    fc.array(fc.array(cell, { minLength: w, maxLength: w }), { minLength: 1, maxLength: 8 }));
  fc.assert(fc.property(rows, rs => {
    const nonBlank = rs.filter(r => r.some(c => c.trim() !== ""));
    return JSON.stringify(CSV.parse(toCsv(rs))) === JSON.stringify(nonBlank);
  }), RUNS);
});

test("PROPERTY: CSV reader never crashes on any text at all", () => {
  fc.assert(fc.property(fc.string({ maxLength: 300 }), s => Array.isArray(CSV.parse(s))), RUNS);
});

// ---------- WHOOP ----------
const WHOOP_COLS = ["Cycle start time", "Cycle end time", "Recovery score %", "Resting heart rate (bpm)",
  "Heart rate variability (ms)", "Skin temp (celsius)", "Day Strain", "Wake onset", "Asleep duration (min)",
  "In bed duration (min)", "Some new column"];
const whoopCell = col => {
  if (/time|onset/i.test(col)) {
    return fc.oneof({ weight: 6, arbitrary: isoDate.map(d => `${d} 07:15:00`) },
      { weight: 1, arbitrary: fc.constantFrom("", "not-a-date", "2025-13-45 99:99:99") });
  }
  return fc.oneof({ weight: 6, arbitrary: fc.integer({ min: 0, max: 600 }).map(String) },
    { weight: 1, arbitrary: fc.constantFrom("", "--", "N/A", "1,240", "-3", "99999999") });
};
const whoopCsv = fc.shuffledSubarray(WHOOP_COLS, { minLength: 3 }).chain(cols =>
  fc.array(fc.tuple(...cols.map(whoopCell)), { maxLength: 60 })
    .map(rows => toCsv([cols, ...rows])));

test("PROPERTY: WHOOP adapter always returns the standard model, whatever columns and junk it gets", () => {
  fc.assert(fc.property(whoopCsv, text => isStandard(WHOOP.parse(text))), RUNS);
});

test("PROPERTY: WHOOP adapter never reports steps or cycle data (WHOOP CSVs don't have them)", () => {
  fc.assert(fc.property(whoopCsv, text => {
    const ds = WHOOP.parse(text);
    return ds.daily.every(d => d.steps === null && d.cycle_day === null);
  }), RUNS);
});

test("PROPERTY: column order doesn't matter to the WHOOP adapter", () => {
  const cols = ["Wake onset", "Recovery score %", "Heart rate variability (ms)", "Asleep duration (min)"];
  const rows = fc.array(fc.tuple(isoDate.map(d => d + " 07:00:00"), fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 10, max: 150 }), fc.integer({ min: 120, max: 600 })), { maxLength: 30 });
  fc.assert(fc.property(rows, fc.constantFrom([0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2]), (rs, order) => {
    const a = WHOOP.parse(toCsv([cols, ...rs.map(r => r.map(String))]));
    const b = WHOOP.parse(toCsv([order.map(i => cols[i]), ...rs.map(r => order.map(i => String(r[i])))]));
    return JSON.stringify(a.daily) === JSON.stringify(b.daily);
  }), RUNS);
});

// ---------- Apple Health ----------
const TYPES = APPLE.TYPES;
const SOURCES = ["iPhone", "Apple Watch", "Health"];
const stamp = (date, h, m) => `${date} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00 -0400`;
// Realistic density: a few weeks, many readings per day, several devices.
// (A first version spread readings over 2 years, so two devices almost never
//  logged the same day — a planted double-counting bug slipped through.)
const shortWindowDate = fc.integer({ min: 0, max: 13 }).map(n =>
  new Date(Date.UTC(2025, 8, 1) + n * 86400000).toISOString().slice(0, 10));
const appleRecord = fc.record({
  kind: fc.constantFrom("steps", "steps", "steps", "rhr", "hrv", "sleep", "awake", "inbed", "flow", "heart", "junk"),
  date: shortWindowDate, source: fc.constantFrom(...SOURCES),
  hour: fc.integer({ min: 0, max: 20 }), mins: fc.integer({ min: 1, max: 180 }),
  value: fc.integer({ min: 0, max: 5000 })
}).map(r => {
  const start = stamp(r.date, r.hour, 0);
  const endH = r.hour + Math.floor(r.mins / 60), endM = r.mins % 60;
  const end = stamp(r.date, Math.min(endH, 23), endM);
  const base = `sourceName="${r.source}" startDate="${start}" endDate="${end}"`;
  switch (r.kind) {
    case "steps": return { r, xml: `<Record type="${TYPES.STEPS}" ${base} unit="count" value="${r.value}"/>` };
    case "rhr":   return { r, xml: `<Record type="${TYPES.RHR}" ${base} unit="count/min" value="${40 + (r.value % 60)}"/>` };
    case "hrv":   return { r, xml: `<Record type="${TYPES.HRV}" ${base} unit="ms" value="${10 + (r.value % 120)}"><HeartRateVariabilityMetadataList/></Record>` };
    case "sleep": return { r, xml: `<Record type="${TYPES.SLEEP}" ${base} value="HKCategoryValueSleepAnalysisAsleepCore"/>` };
    case "awake": return { r, xml: `<Record type="${TYPES.SLEEP}" ${base} value="HKCategoryValueSleepAnalysisAwake"/>` };
    case "inbed": return { r, xml: `<Record type="${TYPES.SLEEP}" ${base} value="HKCategoryValueSleepAnalysisInBed"/>` };
    case "flow":  return { r, xml: `<Record type="${TYPES.FLOW}" ${base} value="HKCategoryValueMenstrualFlowMedium"/>` };
    case "heart": return { r, xml: `<Record type="HKQuantityTypeIdentifierHeartRate" ${base} value="${r.value}"/>` };
    default:      return { r, xml: `<Record type="${TYPES.STEPS}" ${base} value="lots"/>` };
  }
});
const appleExport = fc.array(appleRecord, { maxLength: 80 }).map(recs => ({
  recs,
  xml: `<?xml version="1.0"?>\n<HealthData locale="en_US">\n <Me HKCharacteristicTypeIdentifierDateOfBirth="1999-09-09"/>\n` +
       recs.map(x => " " + x.xml).join("\n") + "\n</HealthData>\n"
}));

test("PROPERTY: Apple adapter always returns the standard model", () => {
  fc.assert(fc.property(appleExport, ({ xml }) => isStandard(APPLE.parseText(xml))), RUNS);
});

test("PROPERTY: reading a huge file in slices gives the same answer as reading it whole, wherever it's cut", () => {
  fc.assert(fc.property(appleExport, fc.array(fc.nat(), { maxLength: 12 }), ({ xml }, cuts) => {
    const points = [...new Set(cuts.map(c => c % (xml.length + 1)))].sort((a, b) => a - b);
    const p = APPLE.createParser();
    let last = 0;
    points.concat([xml.length]).forEach(pt => { p.push(xml.slice(last, pt)); last = pt; });
    return JSON.stringify(p.finish().daily) === JSON.stringify(APPLE.parseText(xml).daily);
  }), RUNS);
});

test("PROPERTY: steps are never double counted — each day equals the biggest single device's total", () => {
  fc.assert(fc.property(appleExport, ({ recs, xml }) => {
    const ds = APPLE.parseText(xml);
    const expect = {};
    recs.filter(x => x.r.kind === "steps").forEach(({ r }) => {
      expect[r.date] = expect[r.date] || {};
      expect[r.date][r.source] = (expect[r.date][r.source] || 0) + r.value;
    });
    return ds.daily.every(d => {
      if (!expect[d.date]) return d.steps === null;
      return d.steps === Math.max(...Object.values(expect[d.date]));
    });
  }), RUNS);
});

test("PROPERTY: Apple adapter never invents a metric that isn't in the export", () => {
  fc.assert(fc.property(appleExport, ({ recs, xml }) => {
    const ds = APPLE.parseText(xml);
    const has = k => recs.some(x => x.r.kind === k);
    return (has("rhr") || ds.daily.every(d => d.resting_hr_bpm === null)) &&
           (has("hrv") || ds.daily.every(d => d.hrv_ms === null)) &&
           (has("sleep") || ds.daily.every(d => d.sleep_hours === null)) &&
           (has("flow") || ds.daily.every(d => d.cycle_day === null)) &&
           ds.daily.every(d => d.recovery_score === null && d.day_strain === null);
  }), RUNS);
});

test("PROPERTY: Apple adapter never crashes on cut-off or garbage files, and never keeps date of birth", () => {
  const garbage = fc.oneof(
    appleExport.chain(({ xml }) => fc.nat({ max: xml.length }).map(n => xml.slice(0, n))),
    fc.string({ maxLength: 400 }).map(s => `<HealthData>${s}<Record type="${TYPES.STEPS}" ${s}`)
  );
  fc.assert(fc.property(garbage, text => {
    const ds = APPLE.parseText(text);
    return isStandard(ds) && !JSON.stringify(ds).includes("1999-09-09");
  }), RUNS);
});
