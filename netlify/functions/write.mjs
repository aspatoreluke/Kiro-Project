/* ============================================================
   netlify/functions/write.mjs — the live AI writing step
   ------------------------------------------------------------
   The browser sends ONLY detected patterns (kinds + numbers, e.g.
   "9 of 12 dizzy days, 35 bpm rise"). Never raw readings, dates,
   names, or anything typed by the patient. We check that strictly
   here, build the prompt on the server, ask the AI for warm,
   plain-language wording, and return it.

   The browser then safety-checks every sentence again and falls
   back to the built-in templates if anything is off, slow, or
   missing. So this function failing can never break the app.

   Keys live in Netlify environment variables, never in the code:
     GEMINI_API_KEY      (free tier, default)   GEMINI_MODEL (optional)
     ANTHROPIC_API_KEY   (paid, optional)       ANTHROPIC_MODEL (optional)

   This endpoint is public (the app has no login). Abuse limits:
   strict input shape, small body, same-site origin check, short
   outputs, and a provider-side spend/rate limit (free tier is
   capped by Google; set a spend limit if you use a paid key).
   ============================================================ */

const MAX_BODY_BYTES = 4000;
const SERVER_TIMEOUT_MS = 7000; // browser gives up at 8s

// Exactly which facts each pattern may carry. Anything else is dropped.
const FACT_KEYS = {
  orthostatic: ["bigJumpDays", "totalDizzyDays", "avgJump", "baselineJump", "windowMinutes"],
  shortsleep:  ["afterShort", "totalCrashDays", "avgSleepOnCrash", "baselineSleep", "threshold"],
  cycle:       ["premenstrualTaps", "totalTaps", "sharePct", "expectedPct", "windowDays"]
};
const REASON_KEYS = ["recovery", "hrv", "sleep", "restingHr"];

const isNum = v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 100000;

// Returns a clean payload, or null if the shape is wrong.
export function sanitize(body) {
  if (!body || typeof body !== "object") return null;
  const findingsIn = Array.isArray(body.findings) ? body.findings : null;
  if (!findingsIn || findingsIn.length > 3) return null;
  const findings = [];
  for (const f of findingsIn) {
    if (!f || !FACT_KEYS[f.kind] || typeof f.facts !== "object" || !f.facts) return null;
    const facts = {};
    for (const k of FACT_KEYS[f.kind]) if (isNum(f.facts[k])) facts[k] = f.facts[k];
    findings.push({ kind: f.kind, facts });
  }
  const t = body.today && typeof body.today === "object" ? body.today : {};
  const reasons = (Array.isArray(t.reasons) ? t.reasons : [])
    .filter(r => r && REASON_KEYS.includes(r.k) && isNum(r.v) && isNum(r.base))
    .slice(0, 4)
    .map(r => ({ k: r.k, v: r.v, base: r.base }));
  const checked = (Array.isArray(t.checked) ? t.checked : []).filter(k => REASON_KEYS.includes(k));
  const days = isNum(body.days) ? Math.round(body.days) : null;
  return { findings, today: { pacing: t.pacing === true, reasons, checked }, days };
}

export function buildPrompt(p) {
  const rules = [
    "You write short, warm, plain-language text for Receipts, an app that helps people with chronic, hard-to-diagnose symptoms share patterns from their wearable with their doctor.",
    "STRICT RULES:",
    "- Never diagnose. Never name a disease or condition. Never say or imply 'you have'.",
    "- Never suggest treatment, medication, supplements, or doses.",
    "- Describe patterns compared to the person's OWN usual (their baseline), never other people.",
    "- Use only the numbers given below. Do not invent, change, or calculate new numbers.",
    "- Calm, kind, non-alarming. About an 8th-grade reading level. Each sentence under 40 words.",
    "- The doctor decides what patterns mean.",
    "",
    "PATTERNS (kind + facts):",
    JSON.stringify(p.findings),
    "",
    "TODAY (pacing = today looks like the lead-up to harder days; reasons compare today to their usual):",
    JSON.stringify(p.today),
    p.days ? `DAYS OF DATA: ${p.days}` : "",
    "",
    "Return ONLY JSON with this exact shape:",
    `{"findings": {"<kind>": {"patient": "one sentence to the person, using 'you'", "doctor": "one sentence for a clinician, about 'the patient'"}},`,
    ` "today": "1-2 sentences for the Today card; if pacing is true, gently suggest taking it easy",`,
    ` "doctorIntro": "one sentence introducing the brief to a clinician",`,
    ` "patientIntro": "one sentence introducing the summary to the person",`,
    ` "patientQuestions": ["three short questions the person could ask their doctor, never naming a condition"]}`,
    "Include one findings entry for each pattern kind given, and no others."
  ];
  return rules.filter(Boolean).join("\n");
}

async function withTimeout(promiseFn, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await promiseFn(ctrl.signal); } finally { clearTimeout(timer); }
}

// ---- Providers ----
async function callGemini(prompt, key, signal) {
  // Try the configured model, then stable aliases, until one exists.
  const models = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"]
    .filter(Boolean);
  let lastErr = "no model";
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1200, responseMimeType: "application/json" }
      }),
      signal
    });
    if (res.status === 404) { lastErr = `model ${model} not found`; continue; }
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    return { model, text };
  }
  throw new Error(lastErr);
}

async function callClaude(prompt, key, signal) {
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 1200, temperature: 0.4,
      messages: [{ role: "user", content: prompt + "\nRespond with the JSON only." }]
    }),
    signal
  });
  if (!res.ok) throw new Error(`claude ${res.status}`);
  const data = await res.json();
  const text = (data?.content || []).map(c => c.text || "").join("");
  return { model, text };
}

// Pull the first {...} block out of the model's reply and parse it.
export function parseJson(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
}

function sameSite(req) {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  if (!origin) return false;
  try {
    const o = new URL(origin).host;
    const self = new URL(req.url).host;
    return o === self || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  } catch (e) { return false; }
}

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { error: "method" });
  if (!sameSite(req)) return json(403, { error: "origin" });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too-big" });
  let body;
  try { body = JSON.parse(raw); } catch (e) { return json(400, { error: "bad-json" }); }
  const payload = sanitize(body);
  if (!payload) return json(400, { error: "bad-shape" });

  const gemini = process.env.GEMINI_API_KEY;
  const claude = process.env.ANTHROPIC_API_KEY;
  if (!gemini && !claude) return json(503, { error: "no-key" });

  try {
    const prompt = buildPrompt(payload);
    const out = await withTimeout(signal => gemini ? callGemini(prompt, gemini, signal) : callClaude(prompt, claude, signal), SERVER_TIMEOUT_MS);
    const result = parseJson(out.text);
    if (!result) return json(502, { error: "unparseable" });
    return json(200, { provider: gemini ? "gemini" : "claude", model: out.model, result });
  } catch (e) {
    // Don't leak details (or keys) to the browser.
    console.error("AI call failed:", e && e.message);
    return json(502, { error: e && e.name === "AbortError" ? "timeout" : "upstream" });
  }
}
