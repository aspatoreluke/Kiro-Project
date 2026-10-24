/* ============================================================
   data.js — Maya's demo dataset (synthetic, WHOOP-shaped)
   ------------------------------------------------------------
   One fictional patient: "Maya, 24", 60 days.
   Shaped to mirror the WHOOP data model (recovery / sleep / cycle),
   so it could plug into a real WHOOP export with no redesign.

   NO real personal health information is used. All values are
   generated here with gentle noise so charts look natural.

   Three patterns are deliberately seeded so the Trigger Detective
   has something real to find (see analysis.js):
     1) Orthostatic: on most "dizzy" days, resting->standing HR
        jumps 30+ bpm after sitting over an hour.
     2) Short-sleep crashes: "fatigue/crash" taps follow nights
        under ~6 hours of sleep (lower recovery + lower HRV).
     3) Pre-menstrual rise: symptoms increase in the ~7 days
        before menstruation.
   ============================================================ */

(function () {
  // Deterministic pseudo-random so the demo is identical every run.
  let _seed = 42;
  function rand() {
    _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
    return _seed / 0x7fffffff;
  }
  function noise(amount) { return (rand() - 0.5) * 2 * amount; }
  function round(n, d = 0) { const p = Math.pow(10, d); return Math.round(n * p) / p; }

  const PATIENT = { name: "Maya", age: 24 };

  const DAYS = 60;
  const today = new Date("2025-10-23T08:00:00"); // fixed "today" for a stable demo
  function dateOffset(daysAgo) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d;
  }
  function iso(d) { return d.toISOString().slice(0, 10); }

  // Cycle: 28-day cycle, period starts on these cycle days = 1.
  // We place menstruation so that the "week before period" lands on
  // identifiable days within the 60-day window.
  const CYCLE_LENGTH = 28;
  // cycle_day 1 == first day of menstruation
  function cycleDayFor(daysAgo) {
    // anchor: 60 days ago was cycle day 10 (arbitrary but fixed)
    const anchorCycleDay = 10;
    const dayIndex = DAYS - daysAgo; // 0..59 oldest->newest
    return ((anchorCycleDay - 1 + dayIndex) % CYCLE_LENGTH) + 1;
  }
  // "Pre-menstrual window" = last 7 cycle days before day 1 (i.e. days 22-28)
  function isPremenstrual(cycleDay) { return cycleDay >= 22 && cycleDay <= 28; }

  // ---- Build the 60 daily records ----
  const daily = [];
  const standingEvents = [];
  const symptomTaps = [];

  // Maya's personal baselines (her "normal")
  const BASE = { restingHr: 60, hrv: 62, sleep: 7.4, recovery: 68, skinTemp: 33.8, steps: 7200 };

  // Pre-decide which days are "short sleep" nights and "dizzy" days,
  // so patterns are consistent and discoverable.
  // Short-sleep nights (by daysAgo): scattered, ~10 of them.
  const shortSleepDays = new Set([58, 52, 47, 41, 36, 30, 23, 17, 11, 4]);
  // Dizzy days (12 of them).
  const dizzyDays = new Set([57, 54, 49, 44, 40, 33, 28, 22, 16, 10, 6, 2]);
  // On most dizzy days the 30+ bpm jump happens (9 of 12 -> clear pattern).
  // These are a strict subset of dizzyDays so the jumps land on dizzy days.
  const orthostaticHitDays = new Set([57, 54, 49, 44, 40, 33, 28, 16, 6]);

  const SYMPTOMS_POOL = ["dizzy", "brain_fog", "fatigue", "pain", "palpitations", "nausea"];

  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    const d = dateOffset(daysAgo);
    const cycleDay = cycleDayFor(daysAgo);
    const premenstrual = isPremenstrual(cycleDay);

    const shortSleep = shortSleepDays.has(daysAgo);
    const sleepHours = shortSleep
      ? round(5.2 + noise(0.5), 1)
      : round(BASE.sleep + noise(0.7), 1);

    // Recovery & HRV drop after short sleep and during premenstrual window.
    let recovery = BASE.recovery + noise(6);
    let hrv = BASE.hrv + noise(7);
    let restingHr = BASE.restingHr + noise(3);
    let skinTemp = BASE.skinTemp + noise(0.12);

    if (shortSleep) { recovery -= 22; hrv -= 16; restingHr += 5; }
    if (premenstrual) { recovery -= 8; hrv -= 6; restingHr += 2; skinTemp += 0.25; }

    const dayStrain = round(8 + noise(4) + (shortSleep ? -1 : 0), 1);
    const steps = Math.max(1200, Math.round(BASE.steps + noise(2600) + (shortSleep ? -1500 : 0)));

    daily.push({
      date: iso(d),
      daysAgo,
      recovery_score: Math.max(5, Math.min(99, Math.round(recovery))),
      hrv_rmssd_ms: Math.max(12, Math.round(hrv)),
      resting_hr_bpm: Math.round(restingHr),
      sleep_hours: sleepHours,
      day_strain: Math.max(2, dayStrain),
      steps: steps,
      skin_temp_c: round(skinTemp, 1),
      cycle_day: cycleDay
    });

    // ---- Standing events (orthostatic) ----
    // Most days have a normal stand (small HR rise). Dizzy-hit days have a big jump.
    const sittingMin = 65 + Math.round(noise(25));
    const hrBefore = Math.round(restingHr + noise(2));
    let hrAfter;
    if (orthostaticHitDays.has(daysAgo)) {
      // Clear 30+ bpm jump (POTS-range). Base 36 with small +/-2 noise so it
      // reliably clears the 30 bpm line the pattern is about.
      hrAfter = hrBefore + 36 + Math.round(noise(2));
    } else {
      hrAfter = hrBefore + 10 + Math.round(noise(4)); // normal-ish
    }
    const standTime = new Date(d); standTime.setHours(10, 20, 0, 0);
    standingEvents.push({
      datetime: standTime.toISOString(),
      date: iso(d),
      daysAgo,
      type: "stand_after_sitting",
      sitting_minutes: sittingMin,
      hr_before_bpm: hrBefore,
      hr_after_bpm: hrAfter,
      hr_jump_bpm: hrAfter - hrBefore
    });

    // ---- Symptom taps ----
    // Build taps consistent with the seeded patterns.
    const taps = [];

    // Dizzy on dizzy days (shortly after standing).
    if (dizzyDays.has(daysAgo)) {
      const t = new Date(d); t.setHours(10, 35 + Math.round(rand() * 8), 0, 0);
      taps.push({ symptom: "dizzy", when: t, severity: 2 + Math.round(rand() * 2) });
    }
    // Fatigue/crash the day AFTER a short-sleep night (i.e., on the short-sleep day itself
    // we model the crash in the afternoon).
    if (shortSleep) {
      const t = new Date(d); t.setHours(15, 10 + Math.round(rand() * 20), 0, 0);
      taps.push({ symptom: "fatigue", when: t, severity: 3 + Math.round(rand() * 2) });
    }
    // Pre-menstrual: extra symptoms sprinkled in the week before period.
    if (premenstrual && rand() > 0.35) {
      const choice = rand() > 0.5 ? "pain" : (rand() > 0.5 ? "nausea" : "brain_fog");
      const t = new Date(d); t.setHours(13 + Math.round(rand() * 6), Math.round(rand() * 50), 0, 0);
      taps.push({ symptom: choice, when: t, severity: 2 + Math.round(rand() * 3) });
    }
    // A little baseline randomness so it's not too perfect. We keep "dizzy" and
    // "fatigue" out of the random pool so those two signals stay clean and the
    // Trigger Detective finds honest, consistent patterns.
    if (rand() > 0.88) {
      const NOISE_POOL = ["brain_fog", "pain", "palpitations", "nausea"];
      const choice = NOISE_POOL[Math.floor(rand() * NOISE_POOL.length)];
      const t = new Date(d); t.setHours(9 + Math.round(rand() * 9), Math.round(rand() * 50), 0, 0);
      taps.push({ symptom: choice, when: t, severity: 1 + Math.round(rand() * 2) });
    }

    taps.forEach(tp => {
      symptomTaps.push({
        datetime: tp.when.toISOString(),
        date: iso(d),
        daysAgo,
        symptom_id: tp.symptom,
        severity: tp.severity,
        note: null
      });
    });
  }

  // ---- Real-source citations (NOT Maya's data; used as honest context) ----
  const SOURCES = {
    cdcShortSleep: {
      label: "Short sleep is common in Massachusetts — roughly 1 in 3 adults report it (CDC PLACES, 2022).",
      url: "https://data.cdc.gov/resource/swc5-untb.json"
    },
    physionet: {
      label: "Wearable + event-tap methods are used in physiological research (Hongn et al., PhysioNet, 2025).",
      url: "https://physionet.org/content/wearable-device-dataset/1.0.1/"
    },
    whoop: {
      label: "Data model mirrors the WHOOP developer API (recovery, HRV, resting HR, sleep, cycles).",
      url: "https://developer.whoop.com/api/"
    }
  };

  // Expose everything on a global the other scripts read.
  window.RECEIPTS_DATA = {
    patient: PATIENT,
    days: DAYS,
    todayISO: iso(today),
    baseline: BASE,
    daily: daily,                 // newest-last (oldest first)
    standingEvents: standingEvents,
    symptomTaps: symptomTaps,
    sources: SOURCES,
    helpers: { isPremenstrual }
  };
})();
