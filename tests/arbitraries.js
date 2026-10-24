/* Shared random-data generators ("arbitraries") for the property tests.
   They deliberately produce messy data: missing values, out-of-range
   readings, junk strings, duplicate dates, and unsorted days. */
const fc = require("fast-check");

const FIELDS = ["recovery_score", "hrv_ms", "resting_hr_bpm", "sleep_hours", "day_strain", "steps", "skin_temp_c", "cycle_day"];

// A real calendar date in a 2-year window, as "YYYY-MM-DD".
const isoDate = fc.integer({ min: 0, max: 730 }).map(n => {
  const d = new Date(Date.UTC(2024, 0, 1) + n * 86400000);
  return d.toISOString().slice(0, 10);
});

// A metric value: usually plausible, sometimes missing or garbage.
const messyValue = fc.oneof(
  { weight: 6, arbitrary: fc.double({ min: 0, max: 200, noNaN: true }) },
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 1, arbitrary: fc.constant("") },
  { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, -5, 1e9) },
  { weight: 1, arbitrary: fc.string({ maxLength: 6 }) }
);

// A raw day-ish object, possibly with a broken date.
const messyRawDay = fc.record({
  date: fc.oneof({ weight: 8, arbitrary: isoDate }, { weight: 1, arbitrary: fc.string({ maxLength: 12 }) }, { weight: 1, arbitrary: fc.constant(null) }),
  ...Object.fromEntries(FIELDS.map(f => [f, messyValue]))
}, { requiredKeys: ["date"] });

const messyRawDays = fc.array(messyRawDay, { maxLength: 120 });

module.exports = { fc, FIELDS, isoDate, messyValue, messyRawDay, messyRawDays };
