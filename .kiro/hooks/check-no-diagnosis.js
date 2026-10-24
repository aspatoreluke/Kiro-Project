#!/usr/bin/env node
/* ============================================================
   check-no-diagnosis.js
   ------------------------------------------------------------
   Safety hook script. Scans the project's user-facing / generated
   text for diagnostic or prescriptive language, using the SAME
   rules as js/safety.js. Flags any violations.

   Run by the "No Diagnostic Language" agent hook (see
   .kiro/hooks/no-diagnosis-language.json) and runnable by hand:
       node .kiro/hooks/check-no-diagnosis.js

   Exit 0 = clean. Exit 2 = violations found (blocks the action).
   ============================================================ */

const fs = require("fs");
const path = require("path");

// We flag genuine diagnostic ASSERTIONS, not the mere word "diagnosis".
// Safe phrasings are explicitly allowed below (SAFE_ALLOW), e.g.
//   "this is not a diagnosis", "hard-to-diagnose conditions",
//   "never used to diagnose", "NOT diagnosis" (in comments).
const DIAGNOSTIC = [
  /\byou (?:have|'ve got|are suffering from) (?:POTS|long covid|me\/?cfs|endometriosis|a (?:disease|disorder|syndrome|condition))\b/i,
  /\bdiagnos(?:e|ing) you\b/i,
  /\b(?:this|that|it) (?:is|confirms) (?:a|an|the) (?:diagnosis|condition|disease)\b/i,
  /\byou (?:are|'re) (?:diabetic|hypertensive|anemic)\b/i,
  /\byou (?:definitely|certainly|clearly) have\b/i,
  /\bit'?s (?:definitely )?(?:POTS|long covid|endometriosis|an autoimmune disease)\b/i
];
const TREATMENT = [
  /\byou should (?:take|try|start|stop) (?:your )?(?:medication|meds|pills|a drug|a supplement)\b/i,
  /\bwe (?:recommend|prescribe) (?:a|an|the)? ?(?:treatment|medication|drug|dose)\b/i,
  /\btake \d+ ?mg\b/i,
  /\b(?:ibuprofen|tylenol|acetaminophen|midodrine|propranolol|beta[- ]?blocker|advil|aspirin)\b/i
];

// Phrases that are always safe even if they contain a trigger word.
const SAFE_ALLOW = [
  /not a diagnosis/i,
  /hard[- ]to[- ]diagnose/i,
  /(?:never|not|n't|only).{0,20}diagnos/i,
  /NOT diagnos/i,
  /suggest(?:ed|ions)?.{0,20}not diagnos/i
];

// Files/dirs we scan for user-facing text.
const TARGET_DIRS = ["js", "."];
const TARGET_FILES = ["index.html", "app.js"];
const EXTS = new Set([".js", ".html"]);
// Don't flag the safety files themselves (they contain the banned words as patterns).
const SKIP = new Set([
  path.join("js", "safety.js"),
  path.join(".kiro", "hooks", "check-no-diagnosis.js")
]);

function collectFiles() {
  const files = new Set(TARGET_FILES);
  const jsDir = path.join(process.cwd(), "js");
  if (fs.existsSync(jsDir)) {
    fs.readdirSync(jsDir).forEach(f => {
      if (EXTS.has(path.extname(f))) files.add(path.join("js", f));
    });
  }
  return [...files];
}

let violations = [];
collectFiles().forEach(rel => {
  if (SKIP.has(rel)) return;
  const full = path.join(process.cwd(), rel);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // Skip lines that contain an explicitly-safe phrasing.
    if (SAFE_ALLOW.some(re => re.test(line))) return;
    [...DIAGNOSTIC, ...TREATMENT].forEach(re => {
      const m = line.match(re);
      if (m) violations.push({ file: rel, line: i + 1, match: m[0], text: line.trim().slice(0, 100) });
    });
  });
});

if (violations.length) {
  console.error("❌ No-diagnosis check FAILED. Potential diagnostic/prescriptive language:");
  violations.forEach(v => console.error(`  ${v.file}:${v.line}  "${v.match}"  ->  ${v.text}`));
  console.error("\nRewrite as a pattern vs. the patient's own baseline. The clinician decides.");
  process.exit(2);
} else {
  console.log("✅ No-diagnosis check passed — no diagnostic or prescriptive language found.");
  process.exit(0);
}
