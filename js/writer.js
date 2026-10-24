/* ============================================================
   writer.js — the writing step (the "AI" layer)
   ------------------------------------------------------------
   Turns structured findings (facts/numbers from analysis.js) into
   warm, plain-English text for: Trigger Detective explanations,
   the Today message, and both brief versions.

   DEFAULT: local templates (no API key, no network, works offline,
   always works on stage). A single generate() seam lets a live AI
   model (OpenAI/Claude) be dropped in later with no other changes.

   EVERY output passes through RECEIPTS_SAFETY.assertSafeText before
   it is returned, so nothing diagnostic can reach the screen.
   ============================================================ */

(function () {
  const SAFETY = window.RECEIPTS_SAFETY;

  // ---- The swappable seam ----
  // The default "model" is a local template function. To use a real AI later,
  // replace generate() with a call to your model that takes the same inputs.
  function generate(kind, facts) {
    return TEMPLATES[kind] ? TEMPLATES[kind](facts) : "";
  }

  // ---- Templates (plain, kind, own-baseline framing, never diagnostic) ----
  const TEMPLATES = {
    orthostatic: (f) =>
      `On ${f.bigJumpDays} of ${f.totalDizzyDays} days you felt dizzy, your heart rate rose about ` +
      `${f.avgJump} bpm within ${f.windowMinutes} minutes of standing up after sitting a while — ` +
      `higher than your usual rise of about ${f.baselineJump} bpm.`,

    shortsleep: (f) =>
      `On ${f.afterShort} of ${f.totalCrashDays} days you logged a crash, it followed a night under ` +
      `${f.threshold} hours of sleep (around ${f.avgSleepOnCrash} h), below your usual ` +
      `${f.baselineSleep} h.`,

    cycle: (f) =>
      `About ${f.sharePct}% of your symptom taps fell in the week before your period, even though ` +
      `that week is only about ${f.expectedPct}% of your cycle — a pattern worth noting.`,

    todayPace: (r) => {
      const bits = r.reasons.map(reason => {
        if (reason.k === "recovery") return `your recovery is a bit below your usual (${reason.v} vs ~${reason.base})`;
        if (reason.k === "hrv") return `your HRV is lower than your usual (${reason.v} vs ~${reason.base} ms)`;
        if (reason.k === "sleep") return `you slept under your usual last night (${reason.v} h vs ~${reason.base} h)`;
        return "";
      }).filter(Boolean);
      return `Your body looks a bit like it did before some of your harder days — ${listJoin(bits)}. ` +
             `Consider taking it easy today and pacing yourself.`;
    },

    todayGood: (r) =>
      `Today looks like a typical day for you — your recent signals are close to your own usual range. ` +
      `A good day to do what feels right, at your own pace.`
  };

  function listJoin(arr) {
    if (arr.length <= 1) return arr.join("");
    if (arr.length === 2) return arr.join(" and ");
    return arr.slice(0, -1).join(", ") + ", and " + arr[arr.length - 1];
  }

  // ---- Public writer functions (each runs through the safety guard) ----
  function writeFinding(finding) {
    const raw = generate(finding.kind, finding.facts);
    return SAFETY.assertSafeText(raw).text;
  }

  function writeTodayMessage(todayResult) {
    const raw = todayResult.pacing
      ? generate("todayPace", todayResult)
      : generate("todayGood", todayResult);
    return SAFETY.assertSafeText(raw).text;
  }

  // Suggested clinician question per finding (evaluation, NOT diagnosis).
  const CLINICIAN_QUESTIONS = {
    orthostatic: "Patterns like this are often evaluated with an orthostatic (standing) vitals check. Would that be worth doing?",
    shortsleep: "Would it be useful to look at how my sleep and next-day energy relate?",
    cycle: "Could my symptoms and my cycle be worth tracking together at my next visit?"
  };

  // Patient questions to ask the doctor (general, non-diagnostic).
  const PATIENT_QUESTIONS = [
    "What might explain the patterns I'm seeing in my own data?",
    "Are there simple checks we could do to understand this better?",
    "What should I track between now and my next visit?"
  ];

  function writeBrief(findings, todayResult, audience) {
    const intro = audience === "doctor"
      ? "Patient-collected wearable patterns, compared to the patient's own baseline over 60 days. Shared to support the visit."
      : "Here's what your own data has been showing lately — in plain language — so you can talk it through with your doctor.";

    const patterns = findings.map(f => {
      const sentence = writeFinding(f);
      const question = audience === "doctor" ? (CLINICIAN_QUESTIONS[f.kind] || "") : "";
      return { title: f.title, sentence, question, source: f.source || null, chart: f.chart };
    });

    const result = {
      audience,
      intro: SAFETY.assertSafeText(intro).text,
      patterns,
      todayLine: writeTodayMessage(todayResult),
      patientQuestions: audience === "patient" ? PATIENT_QUESTIONS.slice() : [],
      disclaimer: "This is not a diagnosis — your clinician decides."
    };
    return result;
  }

  window.RECEIPTS_WRITER = {
    generate,          // the swappable seam
    writeFinding,
    writeTodayMessage,
    writeBrief
  };
})();
