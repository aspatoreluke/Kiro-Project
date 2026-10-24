/* ============================================================
   icons.js — one consistent set of thin outline icons
   ------------------------------------------------------------
   Replaces emoji everywhere (emoji look different on every phone
   and read as "AI-made"). All icons share one style: 24x24 grid,
   1.8px rounded strokes, no fill, color = currentColor.
   Hand-drawn for Receipts; no icon library or brand assets.
   ============================================================ */

(function (root) {
  const P = {
    dizzy:      '<path d="M12 12c0-1 1-1.6 1.8-1 1.3.9.6 3-1 3.2-2.3.3-3.6-2.2-2.6-4.2 1.4-2.8 5.4-2.8 7 0 1.9 3.3-.6 7.4-4.4 7.4C8.6 20.4 5.6 16.8 6.2 12.6 6.9 7.9 11.6 5 16 6.4"/>',
    cloud:      '<path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M8.5 21h7"/>',
    battery:    '<rect x="3" y="7.5" width="16" height="9" rx="2.5"/><path d="M21.5 10.5v3"/><path d="M6 10.5v3"/>',
    bolt:       '<path d="M13 2.5 5.5 13.5H12l-1 8 7.5-11H12z"/>',
    heartbeat:  '<path d="M20.4 12.6 12 21l-8.4-8.4A5 5 0 0 1 12 6a5 5 0 0 1 8.4 6.6z"/><path d="M6.5 12.5h3l1.5-2.5 2 4 1.5-1.5h3"/>',
    waves:      '<path d="M3 8c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/><path d="M3 12.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/><path d="M3 17c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/>',
    head:       '<path d="M8.5 21v-3.2A7 7 0 1 1 18 13.6V15l1.5 2.2-1.5.6V19a2 2 0 0 1-2 2h-2"/><path d="M10 7.5l1.8 1.8L10 11l1.8 1.8"/>',
    flame:      '<path d="M12 21.5c3.6 0 6-2.5 6-6 0-4.2-3.5-6.2-4-10-2.6 1.6-4.4 4.2-4.2 7-1-.4-1.8-1.4-2-2.6C6.7 11.3 6 13 6 15.5c0 3.5 2.4 6 6 6z"/>',
    wind:       '<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 13.5h15a3 3 0 1 1-3 3"/><path d="M3 18h6"/>',
    sparkle:    '<path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9z"/><path d="M18.5 16.5v4M16.5 18.5h4"/>',
    circle:     '<circle cx="12" cy="11" r="7"/><path d="M12 18v3.5"/><path d="M9.5 9a3 3 0 0 1 2.5-1.5"/>',
    sun:        '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    tag:        '<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7.1 7.1a1.4 1.4 0 0 1-2 0z"/><circle cx="8.3" cy="8.3" r="1.4"/>',
    plus:       '<path d="M12 5v14M5 12h14"/>',
    close:      '<path d="M6 6l12 12M18 6 6 18"/>',
    check:      '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
    arrow:      '<path d="M4 12h15M13 6l6 6-6 6"/>',
    watch:      '<rect x="6" y="5.5" width="12" height="13" rx="3.5"/><path d="M9 5.5 9.5 2.5h5l.5 3M9 18.5l.5 3h5l.5-3"/><path d="M12 9.5V12l1.8 1.2"/>'
  };

  // Which icon each built-in symptom uses. Custom symptoms get a tag.
  const SYMPTOM_ICON = {
    dizzy: "dizzy", brain_fog: "cloud", fatigue: "battery", pain: "bolt",
    palpitations: "heartbeat", nausea: "waves", headache: "head", flushing: "flame",
    breath: "wind", tingling: "sparkle", bloating: "circle", light_sens: "sun"
  };

  function svg(name, cls) {
    const body = P[name] || P.tag;
    return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" width="24" height="24" fill="none" ` +
           `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
           `aria-hidden="true" focusable="false">${body}</svg>`;
  }

  // Icon for a symptom by id. Ignores any old emoji saved in the browser.
  function forSymptom(s, cls) {
    const id = s && s.id;
    return svg(SYMPTOM_ICON[id] || "tag", cls);
  }

  root.RECEIPTS_ICONS = { svg, forSymptom, names: Object.keys(P), SYMPTOM_ICON };
})(typeof window !== "undefined" ? window : globalThis);
