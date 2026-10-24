/* ============================================================
   ai.js — asks the live AI for warmer wording, safely
   ------------------------------------------------------------
   The app ALWAYS renders instantly with the built-in templates.
   In the background we send the detected patterns (kinds +
   numbers only) to our Netlify function. If good AI wording comes
   back within 8 seconds, it replaces the template text and gets an
   "AI-written · checked for safety" label.

   Every AI sentence must pass three checks or it's thrown away
   (and that spot keeps its template text):
     1. assertSafeText(): no diagnosis, no treatment/medication
     2. numbers check: every number in the sentence must be one we
        sent. The AI may not invent or change a number.
     3. sane length (not empty, not an essay)
   ============================================================ */

(function (root) {
  const SAFETY = root.RECEIPTS_SAFETY;
  const ENDPOINT = "/.netlify/functions/write";
  const TIMEOUT_MS = 8000;

  const FACT_KEYS = {
    orthostatic: ["bigJumpDays", "totalDizzyDays", "avgJump", "baselineJump", "windowMinutes"],
    shortsleep:  ["afterShort", "totalCrashDays", "avgSleepOnCrash", "baselineSleep", "threshold"],
    cycle:       ["premenstrualTaps", "totalTaps", "sharePct", "expectedPct", "windowDays"]
  };
  // Reference lines the patterns are defined by (e.g. "30+ bpm", "under 6 hours").
  const KIND_CONSTANTS = { orthostatic: [30], shortsleep: [6], cycle: [] };

  const isNum = v => typeof v === "number" && Number.isFinite(v);

  // Only pattern kinds + numbers. No dates, names, symptom labels, or raw readings.
  function buildPayload(findings, today, days) {
    return {
      findings: (findings || []).slice(0, 3).filter(f => FACT_KEYS[f.kind]).map(f => {
        const facts = {};
        FACT_KEYS[f.kind].forEach(k => { if (isNum(f.facts[k])) facts[k] = f.facts[k]; });
        return { kind: f.kind, facts };
      }),
      today: {
        pacing: !!(today && today.pacing),
        reasons: ((today && today.reasons) || []).filter(r => isNum(r.v) && isNum(r.base)).map(r => ({ k: r.k, v: r.v, base: r.base })),
        checked: ((today && today.checked) || []).slice()
      },
      days: isNum(days) ? days : null
    };
  }

  // Every number we're willing to see in AI text, as strings.
  function allowedNumbers(payload) {
    const set = new Set(["1", "2", "3"]); // list numbering / "three questions"
    const add = v => {
      if (!isNum(v)) return;
      set.add(String(v));
      set.add(String(Math.round(v)));
      set.add(v.toFixed(1));
      set.add(String(Math.abs(v)));
    };
    payload.findings.forEach(f => {
      Object.values(f.facts).forEach(add);
      (KIND_CONSTANTS[f.kind] || []).forEach(add);
    });
    payload.today.reasons.forEach(r => { add(r.v); add(r.base); });
    add(payload.days);
    return set;
  }

  function numbersOk(text, allowed) {
    const found = String(text).match(/\d+(?:\.\d+)?/g) || [];
    return found.every(n => allowed.has(n) || allowed.has(String(Number(n))));
  }

  function accept(text, allowed, maxLen) {
    if (typeof text !== "string") return null;
    const t = text.trim().replace(/\s+/g, " ");
    if (t.length < 10 || t.length > (maxLen || 400)) return null;
    if (!SAFETY.assertSafeText(t).safe) return null;
    if (!numbersOk(t, allowed)) return null;
    return t;
  }

  // Check the AI's whole reply. Returns only the pieces that passed, plus a tally.
  function validate(result, payload) {
    const allowed = allowedNumbers(payload);
    const out = { findings: {}, today: null, doctorIntro: null, patientIntro: null, patientQuestions: null };
    let accepted = 0, rejected = 0;
    const take = (v, max) => { const ok = accept(v, allowed, max); ok ? accepted++ : rejected++; return ok; };
    const r = result && typeof result === "object" ? result : {};

    payload.findings.forEach(f => {
      const ai = r.findings && r.findings[f.kind];
      out.findings[f.kind] = {
        patient: take(ai && ai.patient),
        doctor: take(ai && ai.doctor)
      };
    });
    if (payload.today.checked.length) out.today = take(r.today, 500);
    out.doctorIntro = take(r.doctorIntro);
    out.patientIntro = take(r.patientIntro);
    if (Array.isArray(r.patientQuestions) && r.patientQuestions.length >= 3) {
      const qs = r.patientQuestions.slice(0, 3).map(q => take(q, 200));
      out.patientQuestions = qs.every(Boolean) ? qs : null;
    } else rejected++;
    return { text: out, accepted, rejected };
  }

  // ---- State + background request ----
  let state = { status: "idle", key: null, text: null, provider: null, accepted: 0, rejected: 0, reason: null };
  const listeners = [];
  const notify = () => listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });

  async function refresh(findings, today, days, fetchImpl) {
    const payload = buildPayload(findings, today, days);
    const key = JSON.stringify(payload);
    if (key === state.key && state.status !== "failed") return state; // already have / asking for this
    state = { status: "pending", key, text: null, provider: null, accepted: 0, rejected: 0, reason: null };
    notify();

    const doFetch = fetchImpl || root.fetch;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: key,
        signal: ctrl ? ctrl.signal : undefined
      });
      const body = await res.json().catch(() => ({}));
      if (state.key !== key) return state; // data changed while we waited
      if (!res.ok || !body.result) throw new Error(body.error || ("http " + res.status));
      const v = validate(body.result, payload);
      state = { status: "done", key, text: v.text, provider: body.provider || "ai",
                accepted: v.accepted, rejected: v.rejected, reason: null };
    } catch (e) {
      if (state.key !== key) return state;
      const reason = e && e.name === "AbortError" ? "timeout" : (e && e.message) || "error";
      state = { status: "failed", key, text: null, provider: null, accepted: 0, rejected: 0, reason };
    } finally {
      clearTimeout(timer);
    }
    notify();
    return state;
  }

  // Read an accepted AI string, e.g. text("findings", "orthostatic", "patient"). null = use template.
  function text(...path) {
    if (state.status !== "done" || !state.text) return null;
    let v = state.text;
    for (const p of path) { v = v && v[p]; }
    if (v == null) return null;
    // Belt and braces: re-check right before it's shown.
    if (typeof v === "string" && !SAFETY.assertSafeText(v).safe) return null;
    return v;
  }

  function onChange(fn) { listeners.push(fn); }
  function getState() { return state; }
  function reset() { state = { status: "idle", key: null, text: null, provider: null, accepted: 0, rejected: 0, reason: null }; }

  root.RECEIPTS_AI = { buildPayload, allowedNumbers, numbersOk, validate, refresh, text, onChange, getState, reset, TIMEOUT_MS };
})(typeof window !== "undefined" ? window : globalThis);
