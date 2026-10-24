/* ============================================================
   safety.js — the no-diagnosis language guard
   ------------------------------------------------------------
   Every piece of user-facing / generated text passes through
   assertSafeText() before it is shown. It scans for diagnostic
   or prescriptive language and returns pass/fail + reasons.

   This is the single door all generated text walks through, so
   the "never diagnose, never prescribe" promise is enforced in
   one place. The agent hook (.kiro/hooks) reuses the same word
   lists to double-check text during the build.
   ============================================================ */

(function () {
  // Phrases that assert a diagnosis or medical conclusion.
  const DIAGNOSTIC_PATTERNS = [
    /\byou (?:have|'ve got|are suffering from)\b/i,
    /\bthis (?:is|means you have|confirms)\b.*\b(?:disease|disorder|syndrome|condition)\b/i,
    /\bdiagnos(?:e|is|ed|ing)\b/i,
    /\byou (?:are|'re) (?:diabetic|hypertensive|anemic)\b/i,
    /\bconfirms? (?:a|an|the) (?:diagnosis|condition)\b/i,
    /\byou (?:definitely|certainly|clearly) have\b/i
  ];

  // Disease/condition names used as a conclusion (we allow them only as the
  // patient's own words or in "evaluated with" clinician-question framing,
  // which the writer controls; here we flag bare conclusive usage).
  const CONCLUSION_DISEASES = [
    /\byou have POTS\b/i,
    /\byou have long covid\b/i,
    /\byou have (?: me\/cfs|chronic fatigue syndrome)\b/i,
    /\byou have endometriosis\b/i,
    /\bit'?s (?:definitely )?(?:POTS|long covid|endometriosis|an autoimmune disease)\b/i
  ];

  // Treatment / medication instructions.
  const TREATMENT_PATTERNS = [
    /\b(?:take|start|stop|increase|decrease|try) (?:your )?(?:medication|meds|pills|dose)\b/i,
    /\byou should (?:take|try|start|stop)\b/i,
    /\bprescrib(?:e|ed|ing)\b/i,
    /\b(?:recommend|suggest)(?:ed|s)? (?:a|an|the)? ?(?:treatment|medication|drug|dose)\b/i,
    /\b(?:ibuprofen|tylenol|acetaminophen|midodrine|propranolol|beta[- ]?blocker|advil|aspirin)\b/i
  ];

  function scan(text) {
    const problems = [];
    const t = String(text || "");
    DIAGNOSTIC_PATTERNS.forEach(re => { if (re.test(t)) problems.push({ kind: "diagnosis", match: (t.match(re) || [])[0] }); });
    CONCLUSION_DISEASES.forEach(re => { if (re.test(t)) problems.push({ kind: "diagnosis", match: (t.match(re) || [])[0] }); });
    TREATMENT_PATTERNS.forEach(re => { if (re.test(t)) problems.push({ kind: "treatment", match: (t.match(re) || [])[0] }); });
    return problems;
  }

  // Returns { safe:bool, problems:[], text }. Never throws in the browser —
  // if unsafe text somehow appears, we replace it with a safe fallback so the
  // user never sees a diagnostic claim.
  function assertSafeText(text, fallback) {
    const problems = scan(text);
    if (problems.length === 0) return { safe: true, problems: [], text: String(text) };
    // Log for developers; show a safe fallback to the user.
    if (typeof console !== "undefined") {
      console.warn("[Receipts safety] Blocked unsafe text:", problems, "->", text);
    }
    const safeFallback = fallback ||
      "This shows a pattern compared to your own baseline. Your clinician decides what it means.";
    return { safe: false, problems, text: safeFallback };
  }

  window.RECEIPTS_SAFETY = { scan, assertSafeText };
})();
