/* ============================================================
   writer.js — the writing step (the "AI" layer)
   ------------------------------------------------------------
   Turns structured findings (facts/numbers from analysis.js) into
   warm, plain-English text for: Trigger Detective explanations,
   the Today message, and both brief versions.

   DEFAULT: local templates (no API key, no network, works offline,
   always works on stage). When js/ai.js has live AI wording that
   passed its safety + numbers checks, that's used instead.

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
    // Plain words over "bpm", and under 40 words (flagged by our plain-language
    // reviewer agent, run through the Kiro CLI).
    orthostatic: (f) =>
      `On ${f.bigJumpDays} of ${f.totalDizzyDays} days you felt dizzy, your heart rate rose about ` +
      `${f.avgJump} beats per minute within ${f.windowMinutes} minutes of standing up — ` +
      `more than your usual rise of about ${f.baselineJump}.`,

    shortsleep: (f) =>
      `On ${f.afterShort} of ${f.totalCrashDays} days you logged a crash, it followed a night under ` +
      `${f.threshold} hours of sleep (around ${f.avgSleepOnCrash} h), below your usual ` +
      `${f.baselineSleep} h.`,

    cycle: (f) =>
      `About ${f.sharePct}% of your symptom taps fell in the week before your period, even though ` +
      `that week is only about ${f.expectedPct}% of your cycle — a pattern worth noting.`,

    // Three short sentences instead of one long one (our reviewer agent found the
    // old version could run to 72 words when all four signals were off).
    todayPace: (r) => {
      const bits = r.reasons.map(reason => {
        if (reason.k === "recovery") return `recovery score ${reason.v} (usually ~${reason.base})`;
        if (reason.k === "hrv") return `heart rate variability (HRV) ${reason.v} (usually ~${reason.base})`;
        if (reason.k === "sleep") return `sleep ${reason.v} hours (usually ~${reason.base})`;
        if (reason.k === "restingHr") return `resting heart rate ${reason.v} (usually ~${reason.base})`;
        return "";
      }).filter(Boolean);
      return `Your body looks a bit like it did before some of your harder days. ` +
             `What's different from your usual: ${listJoin(bits)}. ` +
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

  // ---- Live AI (optional) ----
  // If js/ai.js got good, safety-checked wording back, use it. Otherwise null,
  // and we use the templates below. The app never waits on the AI.
  function aiText(...path) {
    const AI = window.RECEIPTS_AI;
    return AI ? AI.text(...path) : null;
  }

  // ---- Public writer functions (each runs through the safety guard) ----
  // *Rich versions return { text, ai } so the screen can label AI-written text.
  function writeFindingRich(finding, audience) {
    const ai = aiText("findings", finding.kind, audience === "doctor" ? "doctor" : "patient");
    if (ai) return { text: ai, ai: true };
    const raw = generate(finding.kind, finding.facts);
    return { text: SAFETY.assertSafeText(raw).text, ai: false };
  }
  function writeFinding(finding, audience) { return writeFindingRich(finding, audience).text; }

  function writeTodayMessageRich(todayResult) {
    // If we couldn't compare anything today, say so plainly instead of guessing.
    if (todayResult.checked && todayResult.checked.length === 0) {
      return { text: "We don't have enough of today's data to compare with your usual yet. " +
                     "Listen to your body and go at your own pace.", ai: false };
    }
    const ai = aiText("today");
    if (ai) return { text: ai, ai: true };
    const raw = todayResult.pacing
      ? generate("todayPace", todayResult)
      : generate("todayGood", todayResult);
    return { text: SAFETY.assertSafeText(raw).text, ai: false };
  }
  function writeTodayMessage(todayResult) { return writeTodayMessageRich(todayResult).text; }

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
    const doctor = audience === "doctor";
    const templateIntro = doctor
      ? "Patient-collected wearable patterns, compared to the patient's own baseline. Shared to support the visit."
      : "Here's what your own data has been showing lately, so you can talk it through with your doctor.";
    const aiIntro = aiText(doctor ? "doctorIntro" : "patientIntro");

    const patterns = findings.map(f => {
      const s = writeFindingRich(f, audience);
      // Clinician questions stay hand-written on purpose: they're the most
      // medically sensitive wording, so the AI doesn't improvise them.
      const question = doctor ? (CLINICIAN_QUESTIONS[f.kind] || "") : "";
      return { title: f.title, sentence: s.text, sentenceAi: s.ai, question, source: f.source || null, chart: f.chart };
    });

    const aiQuestions = doctor ? null : aiText("patientQuestions");
    const today = writeTodayMessageRich(todayResult);

    return {
      audience,
      intro: aiIntro || SAFETY.assertSafeText(templateIntro).text,
      introAi: !!aiIntro,
      patterns,
      todayLine: today.text,
      todayAi: today.ai,
      patientQuestions: doctor ? [] : (aiQuestions || PATIENT_QUESTIONS.slice()),
      questionsAi: !!aiQuestions,
      disclaimer: "This is not a diagnosis — your clinician decides."
    };
  }

  // One plain sentence per correlation. "Often came with", never "caused by".
  // "Fatigue / crash" -> "Fatigue", custom labels kept as typed.
  function shortName(label) { return String(label || "This symptom").split(" / ")[0].split("/")[0].trim(); }

  // One plain sentence per correlation. "Often came with", never "caused by".
  //   e.g. "Fatigue often came after short nights: about 5.2 hours of sleep,
  //         vs your usual 7.2. (10 of 10 fatigue days)"
  function writeCorrelation(c, symptomLabel) {
    const who = shortName(symptomLabel);
    const fmt = v => (c.field === "steps" ? Math.round(v).toLocaleString("en-US") : v);
    const unit = c.field === "steps" ? " steps" : (c.unit ? " " + c.unit : "");
    const low = c.direction === "low";
    let when;
    if (c.field === "sleep_hours") when = low ? "after short nights" : "after long nights";
    else if (c.field === "steps") when = low ? "on less active days" : "on more active days";
    else when = `when your ${c.metric} was ${low ? "lower" : "higher"} than usual`;
    const raw = `${who} often came ${when}: about ${fmt(c.typical)}${unit}, vs your usual ${fmt(c.usual)}. ` +
                `(${c.hits} of ${c.days} ${who.toLowerCase()} days)`;
    return SAFETY.assertSafeText(raw).text;
  }

  window.RECEIPTS_WRITER = {
    writeCorrelation,
    generate,          // the template "model"
    writeFinding, writeFindingRich,
    writeTodayMessage, writeTodayMessageRich,
    writeBrief
  };
})();
