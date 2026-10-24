/* ============================================================
   standard-model.js — the ONE daily data shape the app uses
   ------------------------------------------------------------
   Every device adapter (WHOOP, Apple Health, ...) converts its
   export into this shape. The rest of the app (timeline, Trigger
   Detective, Today, brief) only ever reads this shape, so it never
   needs to know which device the data came from.

   One day looks like:
     {
       date:           "YYYY-MM-DD",
       recovery_score: 0-100      | null   (WHOOP only)
       hrv_ms:         ms         | null   (method in dataset.hrvMethod)
       resting_hr_bpm: bpm        | null
       sleep_hours:    hours      | null
       day_strain:     0-21       | null   (WHOOP only)
       steps:          count      | null
       skin_temp_c:    degrees C  | null
       cycle_day:      1-60       | null
     }

   Rule: adapters NEVER invent values. Anything missing stays null,
   and the dataset's `availability` flags say what's really there.
   ============================================================ */

(function (root) {
  // Field -> [min, max] plausible range. Values outside are treated as
  // bad readings and dropped (set to null), not "fixed".
  const RANGES = {
    recovery_score: [0, 100],
    hrv_ms:         [1, 300],
    resting_hr_bpm: [25, 220],
    sleep_hours:    [0, 24],
    day_strain:     [0, 21],
    steps:          [0, 150000],
    skin_temp_c:    [25, 45],
    cycle_day:      [1, 60]
  };
  const FIELDS = Object.keys(RANGES);

  // Plain-language names, used when telling people what's missing.
  const LABELS = {
    recovery_score: "recovery score",
    hrv_ms:         "heart rate variability (HRV)",
    resting_hr_bpm: "resting heart rate",
    sleep_hours:    "sleep",
    day_strain:     "daily strain",
    steps:          "steps",
    skin_temp_c:    "skin temperature",
    cycle_day:      "menstrual cycle"
  };

  // A metric counts as "available" only if it shows up on at least
  // this many days. One stray reading isn't enough to compare to a baseline.
  const MIN_DAYS_AVAILABLE = 3;

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function cleanNumber(value, field) {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) return null;
    const [min, max] = RANGES[field];
    if (n < min || n > max) return null;
    if (field === "cycle_day") return Math.round(n);
    if (field === "steps") return Math.round(n);
    return Math.round(n * 10) / 10;
  }

  function emptyDay(date) {
    const day = { date };
    FIELDS.forEach(f => { day[f] = null; });
    return day;
  }

  // Normalize one raw day-ish object into the standard shape.
  // Returns null if it has no valid date.
  function normalizeDay(raw) {
    if (!raw || typeof raw !== "object") return null;
    const date = typeof raw.date === "string" ? raw.date.slice(0, 10) : null;
    if (!date || !DATE_RE.test(date) || isNaN(Date.parse(date + "T00:00:00Z"))) return null;
    const day = emptyDay(date);
    FIELDS.forEach(f => { day[f] = cleanNumber(raw[f], f); });
    return day;
  }

  // Build a complete dataset from raw days.
  //   opts.windowDays: keep only the most recent N days (default 90)
  function buildDataset(rawDays, opts) {
    opts = opts || {};
    const windowDays = opts.windowDays || 90;

    // Normalize, drop bad rows, merge duplicate dates (later non-null wins).
    const byDate = new Map();
    (Array.isArray(rawDays) ? rawDays : []).forEach(raw => {
      const day = normalizeDay(raw);
      if (!day) return;
      const existing = byDate.get(day.date);
      if (!existing) { byDate.set(day.date, day); return; }
      FIELDS.forEach(f => { if (day[f] !== null) existing[f] = day[f]; });
    });

    // Sort oldest -> newest and keep the most recent window.
    let daily = Array.from(byDate.values()).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    // Drop days that have no data at all.
    daily = daily.filter(d => FIELDS.some(f => d[f] !== null));
    if (daily.length) {
      const last = Date.parse(daily[daily.length - 1].date + "T00:00:00Z");
      const cutoff = last - (windowDays - 1) * 86400000;
      daily = daily.filter(d => Date.parse(d.date + "T00:00:00Z") >= cutoff);
    }

    const availability = {};
    FIELDS.forEach(f => {
      availability[f] = daily.filter(d => d[f] !== null).length >= MIN_DAYS_AVAILABLE;
    });

    return {
      source: opts.source || "unknown",
      label: opts.label || "Uploaded data",
      hrvMethod: opts.hrvMethod || null,
      patient: opts.patient || { name: "You", age: null },
      daily,
      availability,
      symptomTaps: Array.isArray(opts.symptomTaps) ? opts.symptomTaps.slice() : [],
      standingEvents: Array.isArray(opts.standingEvents) ? opts.standingEvents.slice() : [],
      notes: Array.isArray(opts.notes) ? opts.notes.slice() : []
    };
  }

  // List of metric fields that are NOT available, in plain words.
  function missingMetrics(dataset) {
    if (!dataset || !dataset.availability) return [];
    return FIELDS.filter(f => !dataset.availability[f]).map(f => ({ field: f, label: LABELS[f] }));
  }

  root.RECEIPTS_MODEL = {
    FIELDS, RANGES, LABELS, MIN_DAYS_AVAILABLE,
    emptyDay, normalizeDay, cleanNumber, buildDataset, missingMetrics
  };
})(typeof window !== "undefined" ? window : globalThis);
