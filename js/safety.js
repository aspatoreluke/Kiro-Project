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
  // Safe phrases that contain a "trigger" word but are NOT a diagnosis, like
  // our own required disclaimer. They're removed before scanning, so a real
  // diagnosis elsewhere in the same text is still caught.
  // (Found by property-based testing: the guard used to block
  //  "This is not a diagnosis — your clinician decides.")
  const SAFE_PHRASES = [
    /\bnot an? (?:medical )?diagnosis\b/gi,
    /\bisn'?t an? diagnosis\b/gi,
    /\bhard[- ]to[- ]diagnose\b/gi,
    /\b(?:never|cannot|can'?t|won'?t|doesn'?t|does not|do not|don'?t) diagnose\b/gi
  ];

  // "You have" about something the person DID ("you have logged 9 taps") is fine.
  // "You have <anything else>" is treated as a possible diagnosis.
  const DID_VERBS = "been|felt|logged|slept|noticed|recorded|tapped|tracked|seen|shared|shown|walked";

  // Phrases that assert a diagnosis or medical conclusion.
  const DIAGNOSTIC_PATTERNS = [
    new RegExp(`\\byou(?: have|'ve) (?!(?:${DID_VERBS})\\b)`, "i"),
    /\byou(?: have|'ve)$/i,
    /\b(?:are|'re|been) suffering from\b/i,
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
    let t = String(text || "");
    SAFE_PHRASES.forEach(re => { t = t.replace(re, " · "); });
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
