/* ============================================================
   symptoms.js — symptom library + per-patient personalization
   ------------------------------------------------------------
   Ships a starter library covering common chronic-illness
   experiences. The patient can add their own symptoms in their
   words, remove ones that don't apply, and reorder. Their set is
   saved in localStorage (no login).

   The optional "what I live with" note is used ONLY to suggest a
   sensible starter set and to word things kindly — NEVER to
   diagnose (see steering: safety.md).
   ============================================================ */

(function () {
  const STORAGE_KEY = "receipts.symptomSet.v1";
  const CONDITION_KEY = "receipts.conditionNote.v1";

  // Starter library: id -> label, icon, color
  const LIBRARY = {
    dizzy:        { label: "Dizzy",            icon: "💫", color: "#3E7CB1" },
    brain_fog:    { label: "Brain fog",        icon: "🌫️", color: "#6BA8D6" },
    fatigue:      { label: "Fatigue / crash",  icon: "🔋", color: "#1B3A5B" },
    pain:         { label: "Pain",             icon: "⚡", color: "#5B6FB1" },
    palpitations: { label: "Palpitations",     icon: "💓", color: "#B15B7C" },
    nausea:       { label: "Nausea",           icon: "🤢", color: "#5BA38A" },
    headache:     { label: "Headache",         icon: "🤕", color: "#8A6BB1" },
    flushing:     { label: "Flushing / hives", icon: "🔥", color: "#C57B5B" },
    breath:       { label: "Short of breath",  icon: "🌬️", color: "#4FA0B1" },
    tingling:     { label: "Numbness/tingling",icon: "✨", color: "#7C8AB1" },
    bloating:     { label: "Bloating",         icon: "🎈", color: "#5BA3A0" },
    light_sens:   { label: "Light sensitivity",icon: "🔆", color: "#B1A05B" }
  };

  // Default starter set (the original six).
  const DEFAULT_SET = ["dizzy", "brain_fog", "fatigue", "pain", "palpitations", "nausea"];

  // Light keyword -> suggested starter symptoms (kind suggestions, not diagnosis).
  const SUGGESTIONS = [
    { match: /pots|orthostatic|dysautonomia/i, add: ["dizzy", "palpitations", "fatigue", "brain_fog"] },
    { match: /long ?covid|me\/?cfs|chronic fatigue/i, add: ["fatigue", "brain_fog", "palpitations", "pain"] },
    { match: /migraine|headache/i, add: ["headache", "light_sens", "nausea", "brain_fog"] },
    { match: /endo|endometriosis|period|menstrual/i, add: ["pain", "nausea", "fatigue", "bloating"] },
    { match: /mast ?cell|mcas|allerg|hives|histamine/i, add: ["flushing", "nausea", "dizzy", "breath"] },
    { match: /autoimmune|lupus|ra|arthritis/i, add: ["pain", "fatigue", "brain_fog"] }
  ];

  function getCustoms() {
    // Custom symptoms live alongside library ones; stored fully in the set objects.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // A "symptom set" is an array of {id, label, icon, color, custom:bool}.
  function defaultSetObjects() {
    return DEFAULT_SET.map(id => ({ id, ...LIBRARY[id], custom: false }));
  }

  function loadSet() {
    const saved = getCustoms();
    if (saved && Array.isArray(saved) && saved.length) return saved;
    return defaultSetObjects();
  }

  function saveSet(set) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(set)); } catch (e) {}
  }

  function loadConditionNote() {
    try { return localStorage.getItem(CONDITION_KEY) || ""; } catch (e) { return ""; }
  }
  function saveConditionNote(note) {
    try { localStorage.setItem(CONDITION_KEY, note || ""); } catch (e) {}
  }

  // Suggest a starter set from the condition note (kind, never diagnostic).
  function suggestFromCondition(note) {
    if (!note) return defaultSetObjects();
    const ids = new Set();
    SUGGESTIONS.forEach(s => { if (s.match.test(note)) s.add.forEach(id => ids.add(id)); });
    if (!ids.size) return defaultSetObjects();
    return [...ids].map(id => ({ id, ...LIBRARY[id], custom: false }));
  }

  // Build a custom symptom from free text.
  const CUSTOM_COLORS = ["#3E7CB1", "#6BA8D6", "#5B6FB1", "#5BA38A", "#8A6BB1", "#C57B5B"];
  let _customCount = 0;
  function makeCustom(name) {
    const clean = String(name || "").trim().slice(0, 40);
    if (!clean) return null;
    const id = "custom_" + clean.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + (++_customCount);
    const color = CUSTOM_COLORS[_customCount % CUSTOM_COLORS.length];
    return { id, label: clean, icon: "📝", color, custom: true };
  }

  // Look up display info for any symptom id (library, custom in set, or raw fallback).
  function lookup(id, set) {
    if (LIBRARY[id]) return { id, ...LIBRARY[id] };
    const inSet = (set || []).find(s => s.id === id);
    if (inSet) return inSet;
    return { id, label: id.replace(/_/g, " "), icon: "📝", color: "#3E7CB1" };
  }

  window.RECEIPTS_SYMPTOMS = {
    LIBRARY,
    loadSet, saveSet,
    loadConditionNote, saveConditionNote,
    suggestFromCondition,
    makeCustom,
    lookup,
    defaultSetObjects
  };
})();
