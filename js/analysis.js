/* ============================================================
   analysis.js — the Trigger Detective engine
   ------------------------------------------------------------
   Everything compares the person to THEIR OWN baseline, never to a
   population average. It outputs structured "findings" that hold
   FACTS AND NUMBERS ONLY (no sentences). The writer.js layer adds
   the plain-English wording later, so the safety guard sits in one
   place.

   Works on any dataset in the standard model (demo or uploaded).
   Missing metrics are null: they are skipped, never treated as 0.
   ============================================================ */

(function (root) {
  // Every public function takes an optional dataset (handy for tests);
  // by default it reads whatever the app is currently showing.
  function current(ds) { return ds || root.RECEIPTS_DATASOURCE.get(); }

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function nums(arr) { return arr.filter(isNum); }

  function median(arr) {
    const s = nums(arr).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(arr) {
    const s = nums(arr);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
  }
  function roundOrNull(v, digits) {
    if (!isNum(v)) return null;
    const p = Math.pow(10, digits || 0);
    return Math.round(v * p) / p;
  }

  // ---- 1) Baseline: the person's own "normal" per signal ----
  // Each value is a finite, non-negative number, or null if that metric
  // isn't in the data.
  function computeBaseline(ds) {
    const D = current(ds);
    const daily = D.daily || [];
    return {
      restingHr: roundOrNull(median(daily.map(d => d.resting_hr_bpm))),
      hrv:       roundOrNull(median(daily.map(d => d.hrv_ms))),
      sleep:     roundOrNull(median(daily.map(d => d.sleep_hours)), 1),
      recovery:  roundOrNull(median(daily.map(d => d.recovery_score))),
      standJump: roundOrNull(median((D.standingEvents || []).map(e => e.hr_jump_bpm)))
    };
  }

  function tapsFor(D, symptomId) {
    return (D.symptomTaps || []).filter(t => t.symptom_id === symptomId);
  }
  function dayFor(D, date) { return (D.daily || []).find(d => d.date === date); }

  // ---- 2) Trigger Detective ----
  // Pattern A: big heart-rate jump after standing, on dizzy days.
  function orthostaticFinding(D, baseline) {
    if (!(D.standingEvents || []).length) return null;
    const dizzy = tapsFor(D, "dizzy");
    if (dizzy.length < 4) return null;

    const jumps = [], bigJumps = [];
    dizzy.forEach(tap => {
      const ev = D.standingEvents.find(e => e.date === tap.date);
      if (ev && isNum(ev.hr_jump_bpm)) {
        jumps.push(ev.hr_jump_bpm);
        if (ev.hr_jump_bpm >= 30) bigJumps.push(ev.hr_jump_bpm);
      }
    });
    if (!jumps.length) return null;

    const strength = bigJumps.length / jumps.length;
    if (strength < 0.5) return null; // not strong enough -> drop

    return {
      id: "orthostatic",
      kind: "orthostatic",
      strength,
      title: "Standing up and feeling dizzy",
      facts: {
        symptom: "dizzy",
        bigJumpDays: bigJumps.length,
        totalDizzyDays: jumps.length,
        // Average of the big-jump days, so the number matches the "30+ bpm" pattern.
        avgJump: Math.round(mean(bigJumps)),
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
  // (sleep_hours on a day = the sleep you got the night before it.)
  function shortSleepFinding(D, baseline) {
    if (!D.availability || !D.availability.sleep_hours) return null;
    const fatigue = tapsFor(D, "fatigue");
    if (fatigue.length < 3) return null;

    const sleepOnCrashDays = [];
    fatigue.forEach(tap => {
      const day = dayFor(D, tap.date);
      if (day && isNum(day.sleep_hours)) sleepOnCrashDays.push(day.sleep_hours);
    });
    if (sleepOnCrashDays.length < 3) return null;

    const afterShort = sleepOnCrashDays.filter(h => h < 6).length;
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
        avgSleepOnCrash: roundOrNull(mean(sleepOnCrashDays), 1),
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
      source: root.RECEIPTS_DATASOURCE ? root.RECEIPTS_DATASOURCE.sources.cdcShortSleep : null
    };
  }

  // Pattern C: symptoms clustering in the week before a period.
  // Uses day.premenstrual (set by datasource.annotateCycle from the person's
  // own cycle length). Only runs if cycle data is present.
  function cycleFinding(D) {
    if (!D.availability || !D.availability.cycle_day) return null;

    let pre = 0, other = 0;
    (D.symptomTaps || []).forEach(tap => {
      const day = dayFor(D, tap.date);
      if (!day || typeof day.premenstrual !== "boolean") return;
      if (day.premenstrual) pre++; else other++;
    });
    const total = pre + other;
    if (total < 5) return null;

    // The week before a period is ~25% of a cycle. Flag only if clearly more.
    const share = pre / total;
    if (share < 0.33) return null;

    return {
      id: "cycle",
      kind: "cycle",
      strength: share,
      title: "Symptoms and your cycle",
      facts: {
        premenstrualTaps: pre,
        totalTaps: total,
        sharePct: Math.round(share * 100),
        expectedPct: 25,
        windowDays: 7
      },
      chart: {
        type: "doughnut",
        labels: ["Week before period", "Rest of cycle"],
        values: [pre, other]
      }
    };
  }

  function runDetective(ds) {
    const D = current(ds);
    const baseline = computeBaseline(D);
    const all = [
      orthostaticFinding(D, baseline),
      shortSleepFinding(D, baseline),
      cycleFinding(D)
    ].filter(Boolean);
    all.sort((a, b) => b.strength - a.strength);
    return all.slice(0, 3);
  }

  // Which insights can this dataset support? Used to tell people plainly
  // what isn't available and why (instead of silently showing nothing).
  function insightStatus(ds) {
    const D = current(ds);
    const a = D.availability || {};
    const taps = (D.symptomTaps || []).length;
    const out = [];
    out.push({
      id: "orthostatic", label: "Standing-up heart-rate pattern",
      available: (D.standingEvents || []).length > 0,
      reason: "This needs heart rate measured right as you stand up. Your export doesn't include standing or posture moments."
    });
    out.push({
      id: "shortsleep", label: "Sleep and crashes pattern",
      available: !!a.sleep_hours,
      reason: "Your export doesn't include sleep."
    });
    out.push({
      id: "cycle", label: "Cycle pattern",
      available: !!a.cycle_day,
      reason: "Your export doesn't include menstrual cycle data."
    });
    out.push({
      id: "hrv", label: "Heart rate variability (HRV)",
      available: !!a.hrv_ms,
      reason: "Your export doesn't include HRV, so it's left off the timeline and Today card."
    });
    out.push({
      id: "taps", label: "Symptom taps",
      available: taps >= 3,
      reason: "Patterns need symptom taps to compare against. Tap symptoms as they happen and patterns will appear."
    });
    return out;
  }

  // ---- 3) Early warning: does "today" look like the lead-up to harder days? ----
  function todayScore(ds) {
    const D = current(ds);
    const baseline = computeBaseline(D);
    const daily = D.daily || [];
    const todayRec = daily[daily.length - 1] || {};

    // Gentle 0-1 score from own-baseline deviations. Each check only runs
    // when BOTH today's value and the baseline exist.
    let score = 0;
    const reasons = [];
    const checked = [];
    if (isNum(todayRec.recovery_score) && isNum(baseline.recovery)) {
      checked.push("recovery");
      if (todayRec.recovery_score < baseline.recovery - 12) {
        score += 0.4; reasons.push({ k: "recovery", v: todayRec.recovery_score, base: baseline.recovery });
      }
    }
    if (isNum(todayRec.hrv_ms) && isNum(baseline.hrv)) {
      checked.push("hrv");
      if (todayRec.hrv_ms < baseline.hrv - 10) {
        score += 0.3; reasons.push({ k: "hrv", v: todayRec.hrv_ms, base: baseline.hrv });
      }
    }
    if (isNum(todayRec.sleep_hours) && isNum(baseline.sleep)) {
      checked.push("sleep");
      if (todayRec.sleep_hours < 6) {
        score += 0.3; reasons.push({ k: "sleep", v: todayRec.sleep_hours, base: baseline.sleep });
      }
    }
    if (isNum(todayRec.resting_hr_bpm) && isNum(baseline.restingHr)) {
      checked.push("restingHr");
      if (todayRec.resting_hr_bpm > baseline.restingHr + 6) {
        score += 0.3; reasons.push({ k: "restingHr", v: todayRec.resting_hr_bpm, base: baseline.restingHr });
      }
    }

    return {
      pacing: score >= 0.4,
      score: Math.min(1, score),
      reasons,
      checked,          // which signals we could actually compare today
      today: todayRec,
      baseline
    };
  }

  root.RECEIPTS_ANALYSIS = { computeBaseline, runDetective, todayScore, insightStatus, median, mean };
})(typeof window !== "undefined" ? window : globalThis);
