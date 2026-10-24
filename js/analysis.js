/* ============================================================
   analysis.js — the Trigger Detective engine
   ------------------------------------------------------------
   Everything compares Maya to MAYA'S OWN baseline, never to a
   population average. It outputs structured "findings" that hold
   FACTS AND NUMBERS ONLY (no sentences). The writer.js layer adds
   the plain-English wording later, so the safety guard sits in one
   place.
   ============================================================ */

(function () {
  const D = window.RECEIPTS_DATA;

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

  // ---- 1) Baseline: the patient's own "normal" per signal ----
  function computeBaseline() {
    const restingHr = D.daily.map(d => d.resting_hr_bpm);
    const hrv = D.daily.map(d => d.hrv_rmssd_ms);
    const sleep = D.daily.map(d => d.sleep_hours);
    const recovery = D.daily.map(d => d.recovery_score);
    return {
      restingHr: Math.round(median(restingHr)),
      hrv: Math.round(median(hrv)),
      sleep: Math.round(median(sleep) * 10) / 10,
      recovery: Math.round(median(recovery)),
      standJump: Math.round(median(D.standingEvents.map(e => e.hr_jump_bpm)))
    };
  }

  // Helper: does a symptom id exist in the data taps?
  function tapsFor(symptomId) {
    return D.symptomTaps.filter(t => t.symptom_id === symptomId);
  }

  // ---- 2) Trigger Detective ----
  // Pattern A: orthostatic HR jump before dizzy taps.
  function orthostaticFinding(baseline) {
    const dizzy = tapsFor("dizzy");
    if (dizzy.length < 4) return null;

    // For each dizzy day, find that day's standing event jump.
    let bigJumpDays = 0;
    const jumps = [];
    const bigJumps = [];
    dizzy.forEach(tap => {
      const ev = D.standingEvents.find(e => e.date === tap.date);
      if (ev) {
        jumps.push(ev.hr_jump_bpm);
        if (ev.hr_jump_bpm >= 30) { bigJumpDays++; bigJumps.push(ev.hr_jump_bpm); }
      }
    });
    if (!jumps.length) return null;

    const strength = bigJumpDays / jumps.length; // fraction of dizzy days with 30+ jump
    if (strength < 0.5) return null; // not strong enough -> drop

    return {
      id: "orthostatic",
      kind: "orthostatic",
      strength,
      title: "Standing up and feeling dizzy",
      facts: {
        symptom: "dizzy",
        bigJumpDays,
        totalDizzyDays: jumps.length,
        // Report the average of the big-jump days, so the number matches the
        // "30+ bpm" pattern we're describing.
        avgJump: Math.round(mean(bigJumps.length ? bigJumps : jumps)),
        baselineJump: baseline.standJump,
        windowMinutes: 20
      },
      chart: {
        type: "bar",
        labels: jumps.map((_, i) => "Dizzy day " + (i + 1)),
        values: jumps,
        reference: 30,
        yLabel: "HR rise after standing (bpm)"
      }
    };
  }

  // Pattern B: short-sleep nights before fatigue crashes.
  function shortSleepFinding(baseline) {
    const fatigue = tapsFor("fatigue");
    if (fatigue.length < 3) return null;

    let afterShort = 0;
    const sleepOnCrashDays = [];
    fatigue.forEach(tap => {
      const day = D.daily.find(d => d.date === tap.date);
      if (day) { sleepOnCrashDays.push(day.sleep_hours); if (day.sleep_hours < 6) afterShort++; }
    });
    if (!sleepOnCrashDays.length) return null;

    const strength = afterShort / sleepOnCrashDays.length;
    if (strength < 0.5) return null;

    return {
      id: "shortsleep",
      kind: "shortsleep",
      strength,
      title: "Short sleep and crashes",
      facts: {
        symptom: "fatigue",
        afterShort,
        totalCrashDays: sleepOnCrashDays.length,
        avgSleepOnCrash: Math.round(mean(sleepOnCrashDays) * 10) / 10,
        baselineSleep: baseline.sleep,
        threshold: 6
      },
      chart: {
        type: "bar",
        labels: sleepOnCrashDays.map((_, i) => "Crash " + (i + 1)),
        values: sleepOnCrashDays,
        reference: 6,
        yLabel: "Sleep the night before (hours)"
      },
      source: D.sources.cdcShortSleep
    };
  }

  // Pattern C: pre-menstrual clustering (only if cycle data present).
  function cycleFinding() {
    const hasCycle = D.daily.some(d => d.cycle_day != null);
    if (!hasCycle) return null;

    let premenstrualTaps = 0, otherTaps = 0;
    D.symptomTaps.forEach(tap => {
      const day = D.daily.find(d => d.date === tap.date);
      if (!day || day.cycle_day == null) return;
      if (D.helpers.isPremenstrual(day.cycle_day)) premenstrualTaps++; else otherTaps++;
    });
    const total = premenstrualTaps + otherTaps;
    if (total < 5) return null;

    // Premenstrual window is 7 of 28 days (~25% of the time). Flag if clearly
    // over-represented versus that 25% expectation.
    const share = premenstrualTaps / total;
    if (share < 0.33) return null; // not a clear cluster -> drop

    return {
      id: "cycle",
      kind: "cycle",
      strength: share,
      title: "Symptoms and your cycle",
      facts: {
        premenstrualTaps,
        totalTaps: total,
        sharePct: Math.round(share * 100),
        expectedPct: 25,
        windowDays: 7
      },
      chart: {
        type: "doughnut",
        labels: ["Week before period", "Rest of cycle"],
        values: [premenstrualTaps, otherTaps]
      }
    };
  }

  function runDetective() {
    const baseline = computeBaseline();
    const all = [
      orthostaticFinding(baseline),
      shortSleepFinding(baseline),
      cycleFinding()
    ].filter(Boolean);
    // Keep the top 2-3 by strength.
    all.sort((a, b) => b.strength - a.strength);
    return all.slice(0, 3);
  }

  // ---- 3) Early warning: how much does "today" look like past flares? ----
  function todayScore() {
    const baseline = computeBaseline();
    const todayRec = D.daily[D.daily.length - 1]; // newest day
    const prevNight = todayRec.sleep_hours;

    // Build a gentle 0-1 "looks like a hard day" score from own-baseline deviations.
    let score = 0, reasons = [];
    if (todayRec.recovery_score < baseline.recovery - 12) {
      score += 0.4; reasons.push({ k: "recovery", v: todayRec.recovery_score, base: baseline.recovery });
    }
    if (todayRec.hrv_rmssd_ms < baseline.hrv - 10) {
      score += 0.3; reasons.push({ k: "hrv", v: todayRec.hrv_rmssd_ms, base: baseline.hrv });
    }
    if (prevNight < 6) {
      score += 0.3; reasons.push({ k: "sleep", v: prevNight, base: baseline.sleep });
    }

    return {
      pacing: score >= 0.4,
      score,
      reasons,
      today: todayRec,
      baseline
    };
  }

  window.RECEIPTS_ANALYSIS = { computeBaseline, runDetective, todayScore };
})();
