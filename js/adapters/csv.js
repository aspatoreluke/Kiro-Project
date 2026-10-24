/* ============================================================
   csv.js — a small, forgiving CSV reader for device exports
   ------------------------------------------------------------
   Handles quoted fields, commas inside quotes, "" escapes, Windows
   line endings, and a byte-order mark. Never throws: bad input just
   gives fewer/emptier rows.
   ============================================================ */

(function (root) {
  function parse(text) {
    const rows = [];
    if (typeof text !== "string" || !text.length) return rows;
    let s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM

    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    // Drop fully blank lines.
    return rows.filter(r => r.some(cell => String(cell).trim() !== ""));
  }

  // Header text -> simple comparable key: "Heart rate variability (ms)" -> "heartratevariabilityms"
  function key(header) { return String(header || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

  // Turn rows into objects keyed by normalized header.
  function toObjects(text) {
    const rows = parse(text);
    if (rows.length < 2) return { headers: rows[0] || [], keys: (rows[0] || []).map(key), records: [] };
    const headers = rows[0].map(h => String(h).trim());
    const keys = headers.map(key);
    const records = rows.slice(1).map(r => {
      const o = {};
      keys.forEach((k, i) => { o[k] = r[i] === undefined ? "" : String(r[i]).trim(); });
      return o;
    });
    return { headers, keys, records };
  }

  root.RECEIPTS_CSV = { parse, key, toObjects };
})(typeof window !== "undefined" ? window : globalThis);
