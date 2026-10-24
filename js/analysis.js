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
  function nonNegative(v) { return v === null ? null : Math.max(0, v); }
  function roundOrNull(v, digits) {
    if (!isNum(v)) return null;
    const p = Math.pow(10, digits || 0); // negative digits round to tens/hundreds
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
      // Heart rate can dip slightly on standing, so a typical "rise" can be
      // negative. We report it as 0 rather than "a rise of -8 bpm".
      // (Found by property-based testing.)
      standJump: nonNegative(roundOrNull(median((D.standingEvents || []).map(e => e.hr_jump_bpm))))
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

  // ---- 4) Quick correlations: symptom days vs. the person's own low/high days ----
  // "Low" = in the bottom quarter of THIS person's readings, "high" = top quarter,
  // so ~25% of days are low (or high) by definition. We report a link only when a
  // symptom's days are low/high far more often than that.
  const CORR_METRICS = [
    { field: "sleep_hours",    name: "sleep",                 unit: "hours" },
    { field: "resting_hr_bpm", name: "resting heart rate",    unit: "bpm" },
    { field: "hrv_ms",         name: "heart rate variability (HRV)", unit: "ms" },
    { field: "recovery_score", name: "recovery score",        unit: "" },
    { field: "steps",          name: "steps",                 unit: "steps" },
    { field: "skin_temp_c",    name: "skin temperature",      unit: "°C" }
  ];
  const CORR_MIN_DAYS = 3;      // need at least 3 symptom days with that metric
  const CORR_MIN_SHARE = 0.5;   // at least half of those days
  const CORR_MIN_LIFT = 2;      // and at least 2x the usual 1-in-4

  const CORR_MAX_P = 0.02;      // and unlikely to be chance (2% or less)
  const CORR_PER_SYMPTOM = 2;   // at most 2 lines per symptom, so one symptom can't fill the list

  // P(X >= k) for X ~ Binomial(n, p).
  function binomTail(n, k, p) {
    let sum = 0;
    for (let i = k; i <= n; i++) {
      let c = 1;
      for (let j = 0; j < i; j++) c = c * (n - j) / (j + 1);
      sum += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
    }
    return Math.min(1, sum);
  }

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function correlations(ds, opts) {
    const D = current(ds);
    const daily = D.daily || [];
    const a = D.availability || {};
    const limit = (opts && opts.limit) || 5;
    const byDate = new Map(daily.map(d => [d.date, d]));

    // Unique days per symptom (two taps on one day count once).
    const daysBySymptom = new Map();
    (D.symptomTaps || []).forEach(t => {
      if (!byDate.has(t.date)) return;
      if (!daysBySymptom.has(t.symptom_id)) daysBySymptom.set(t.symptom_id, new Set());
      daysBySymptom.get(t.symptom_id).add(t.date);
    });

    const out = [];
    CORR_METRICS.forEach(m => {
      if (!a[m.field]) return;
      const values = nums(daily.map(d => d[m.field])).sort((x, y) => x - y);
      if (values.length < 8) return; // too few days to know what "usual" is
      const low = quantile(values, 0.25), high = quantile(values, 0.75);
      if (!(high > low)) return;      // flat data: nothing is low or high
      const lowRate = values.filter(v => v <= low).length / values.length;
      const highRate = values.filter(v => v >= high).length / values.length;

      daysBySymptom.forEach((dates, symptom) => {
        const vals = [...dates].map(d => byDate.get(d)[m.field]).filter(isNum);
        if (vals.length < CORR_MIN_DAYS) return;
        [["low", low, lowRate, v => v <= low], ["high", high, highRate, v => v >= high]].forEach(([dir, cut, base, test]) => {
          const hitVals = vals.filter(test);
          const hits = hitVals.length;
          const share = hits / vals.length;
          if (hits < CORR_MIN_DAYS || share < CORR_MIN_SHARE || share < base * CORR_MIN_LIFT) return;
          // Could this be chance? Probability of this many low/high days if the
          // symptom had nothing to do with the metric (binomial tail).
          const p = binomTail(vals.length, hits, base);
          if (p > CORR_MAX_P) return;
          const digits = m.field === "steps" ? -2 : 1;
          out.push({
            symptom, field: m.field, metric: m.name, unit: m.unit, direction: dir,
            threshold: roundOrNull(cut, digits),
            typical: roundOrNull(median(hitVals), digits),   // typical value on those days
            hits, days: vals.length, share, usualShare: base, p,
            usual: roundOrNull(median(values), digits),
            strength: share * Math.min(1, vals.length / 8)
          });
        });
      });
    });

    // Strongest first; at most one line per symptom + metric pair.
    out.sort((x, y) => y.strength - x.strength || y.hits - x.hits);
    const seen = new Set(), perSymptom = new Map();
    return out.filter(c => {
      const k = c.symptom + "|" + c.field;
      const n = perSymptom.get(c.symptom) || 0;
      if (seen.has(k) || n >= CORR_PER_SYMPTOM) return false;
      seen.add(k); perSymptom.set(c.symptom, n + 1); return true;
    }).slice(0, limit);
  }

  // ---- 5) Echoes: does today look like the mornings before past symptoms? ----
  // A day's readings (last night's sleep, this morning's HRV / resting HR /
  // recovery) come BEFORE that day's symptoms, so a symptom day's readings are
  // its "lead-up". We mark each reading low/high vs the person's own quartiles
  // and look for today's unusual readings in past lead-ups.
  // Facts only (no sentences); writer.js words them.
  const ECHO_METRICS = [
    { field: "sleep_hours",    key: "sleep" },
    { field: "hrv_ms",         key: "hrv" },
    { field: "resting_hr_bpm", key: "restingHr" },
    { field: "recovery_score", key: "recovery" }
  ]; // steps left out on purpose: today's step count isn't finished yet
  const ECHO_MIN_EPISODES = 3;  // a symptom needs 3+ past days to compare
  const ECHO_MIN_MATCHES = 2;   // headline needs 2+ matching past days

  function echoes(ds) {
    const D = current(ds);
    const daily = D.daily || [];
    const a = D.availability || {};
    const today = daily[daily.length - 1];
    const byDate = new Map(daily.map(d => [d.date, d]));
    const result = { state: "few-logs", today: today ? today.date : null, headline: null, cards: [], receipts: (D.symptomTaps || []).length };
    if (!today) return result;

    // Personal low/high cut-offs per metric that's really in the data.
    const metrics = ECHO_METRICS.map(m => {
      if (!a[m.field]) return null;
      const vals = nums(daily.map(d => d[m.field])).sort((x, y) => x - y);
      if (vals.length < 8) return null;
      const low = quantile(vals, 0.25), high = quantile(vals, 0.75);
      if (!(high > low)) return null;
      return Object.assign({ low, high, usual: median(vals), n: vals.length }, m);
    }).filter(Boolean);
    const flagOf = (day, m) => {
      const v = day && day[m.field];
      if (!isNum(v)) return null;
      // Strictly past the person's quartiles, so ordinary days that tie with
      // the cut-off (common with whole-number readings) don't count as unusual.
      return v < m.low ? "low" : v > m.high ? "high" : null;
    };

    // Past episodes: unique days per symptom, not counting today.
    const episodes = new Map();
    (D.symptomTaps || []).forEach(t => {
      if (t.date === today.date || !byDate.has(t.date)) return;
      if (!episodes.has(t.symptom_id)) episodes.set(t.symptom_id, new Set());
      episodes.get(t.symptom_id).add(t.date);
    });
    const comparable = [...episodes.entries()].filter(([, s]) => s.size >= ECHO_MIN_EPISODES);
    if (!comparable.length) return result;                 // too few logs yet
    if (!metrics.length) { result.state = "no-data"; return result; }

    // Today's unusual readings (vs this person's own usual).
    const todayFlags = metrics.map(m => ({ m, dir: flagOf(today, m) })).filter(f => f.dir);
    if (!todayFlags.length) { result.state = "normal"; return result; }
    const need = Math.max(1, Math.ceil(todayFlags.length / 2));
    const resembles = day => todayFlags.filter(f => flagOf(day, f.m) === f.dir).length >= need;
    // How often an ordinary day resembles today (to rule out "everything matches").
    const others = daily.filter(d => d.date !== today.date);
    const baseRate = others.length ? others.filter(resembles).length / others.length : 1;

    // Headline: the symptom whose lead-ups today resembles most.
    let best = null;
    comparable.forEach(([symptom, dates]) => {
      const list = [...dates].sort().reverse(); // most recent first
      const matched = list.filter(d => resembles(byDate.get(d)));
      const share = matched.length / list.length;
      if (matched.length < ECHO_MIN_MATCHES || share < Math.max(0.5, 2 * baseRate)) return;
      if (binomTail(list.length, matched.length, Math.max(baseRate, 0.05)) > 0.05) return;
      const cand = { symptom, matches: matched.length, episodes: list.length, share, dates: matched };
      if (!best || cand.matches * cand.share > best.matches * best.share) best = cand;
    });

    // Cards: one specific reason per symptom, from today's unusual readings.
    const cards = [];
    comparable.forEach(([symptom, dates]) => {
      let top = null;
      todayFlags.forEach(f => {
        const vals = [...dates].map(d => flagOf(byDate.get(d), f.m));
        const known = vals.length; // every past episode day counts, even if this reading was missing
        const hits = vals.filter(v => v === f.dir).length;
        const usualRate = others.filter(d => flagOf(d, f.m) === f.dir).length / Math.max(1, others.length);
        const share = hits / known;
        if (hits < ECHO_MIN_EPISODES || share < 0.5 || share < 2 * usualRate) return;
        if (binomTail(known, hits, Math.max(usualRate, 0.05)) > 0.02) return;
        if (!top || share > top.share || (share === top.share && hits > top.hits)) {
          const digits = f.m.field === "sleep_hours" ? 1 : 0;
          top = { symptom, field: f.m.field, key: f.m.key, direction: f.dir, hits, episodes: known, share,
                  todayValue: roundOrNull(today[f.m.field], digits), usual: roundOrNull(f.m.usual, digits) };
        }
      });
      if (top) cards.push(top);
    });
    cards.sort((x, y) => y.share - x.share || y.hits - x.hits);
    // The headline symptom's card first, then the strongest others; max 3.
    if (best) cards.sort((x, y) => (y.symptom === best.symptom) - (x.symptom === best.symptom));

    result.state = best ? "echo" : (cards.length ? "watch" : "normal");
    result.headline = best;
    result.cards = cards.slice(0, 3);
    return result;
  }

  root.RECEIPTS_ANALYSIS = { computeBaseline, runDetective, todayScore, insightStatus, correlations, echoes, median, mean };
})(typeof window !== "undefined" ? window : globalThis);
