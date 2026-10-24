/* Property-based tests for js/safety.js (the no-diagnosis guard).
   Instead of a few hand-picked examples, fast-check generates hundreds
   of random sentences and checks rules that must ALWAYS hold.
   Validates: Requirement 8 (safety) and 17.2. */
const test = require("node:test");
const fc = require("fast-check");
const { load } = require("./load");

const S = load().RECEIPTS_SAFETY;
const RUNS = { numRuns: 300 };

// Building blocks for random sentences.
const CONDITIONS = ["POTS", "long COVID", "ME/CFS", "endometriosis", "a disease", "a disorder",
  "a syndrome", "a condition"];
const MEDS = ["ibuprofen", "Tylenol", "acetaminophen", "midodrine", "propranolol", "beta-blocker",
  "beta blocker", "Advil", "aspirin"];
const SAFE_WORDS = ["your", "heart", "rate", "rose", "after", "standing", "on", "days", "when",
  "sleep", "was", "shorter", "than", "usual", "pattern", "compared", "to", "baseline", "calm",
  "today", "looks", "steady", "pace", "gently", "noticed", "the", "and", "logged"];
const safeText = fc.array(fc.constantFrom(...SAFE_WORDS), { maxLength: 12 }).map(w => w.join(" "));
const anyCase = s => fc.boolean().map(up => (up ? s.toUpperCase() : s));

test("PROPERTY: 'you have <condition>' is always blocked, wherever it appears", () => {
  fc.assert(fc.property(safeText, fc.constantFrom(...CONDITIONS), safeText, fc.boolean(),
    (before, cond, after, capital) => {
      const phrase = (capital ? "You have " : "you have ") + cond;
      return S.scan(`${before} ${phrase} ${after}`).length > 0;
    }), RUNS);
});

test("PROPERTY: medication names are always blocked, in any case", () => {
  fc.assert(fc.property(safeText, fc.constantFrom(...MEDS).chain(anyCase), safeText,
    (before, med, after) => S.scan(`${before} ${med} ${after}`).some(p => p.kind === "treatment")), RUNS);
});

test("PROPERTY: 'This is not a diagnosis' is always allowed", () => {
  const DISCLAIMERS = [
    "This is not a diagnosis — your clinician decides.",
    "This is not a diagnosis.",
    "this is not a diagnosis, your doctor decides"
  ];
  fc.assert(fc.property(safeText, fc.constantFrom(...DISCLAIMERS), safeText,
    (before, disclaimer, after) => S.scan(`${before} ${disclaimer} ${after}`).length === 0), RUNS);
});

test("PROPERTY: 'you have' about what the person DID is allowed ('you have logged 9 taps')", () => {
  const DID = ["been", "felt", "logged", "slept", "noticed", "recorded", "tapped", "tracked"];
  fc.assert(fc.property(safeText, fc.constantFrom(...DID), safeText, fc.boolean(),
    (before, verb, after, short) =>
      S.scan(`${before} ${short ? "you've" : "you have"} ${verb} ${after}`).length === 0), RUNS);
});

test("PROPERTY: a disclaimer can't be used to sneak a diagnosis past the guard", () => {
  fc.assert(fc.property(safeText, fc.constantFrom(...CONDITIONS), fc.boolean(),
    (filler, cond, disclaimerFirst) => {
      const a = "This is not a diagnosis.", b = `You have ${cond}.`;
      return S.scan(disclaimerFirst ? `${a} ${filler} ${b}` : `${b} ${filler} ${a}`).length > 0;
    }), RUNS);
});

test("PROPERTY: plain own-baseline pattern wording is never blocked", () => {
  fc.assert(fc.property(safeText, text => S.scan(text).length === 0), RUNS);
});

test("PROPERTY: whatever goes in, what comes out of assertSafeText is safe to show", () => {
  const risky = fc.oneof(
    fc.string(),
    fc.tuple(safeText, fc.constantFrom(...CONDITIONS, ...MEDS), safeText).map(p => p.join(" you have ")),
    fc.tuple(safeText, fc.constantFrom(...MEDS)).map(p => p.join(" take "))
  );
  fc.assert(fc.property(risky, s => S.scan(S.assertSafeText(s).text).length === 0), RUNS);
});
