/* ============================================================
   whoop.js — WHOOP CSV export  ->  standard daily model
   ------------------------------------------------------------
   WHOOP's in-app Data Export emails a zip of CSVs. The main one is
   physiological_cycles.csv (recovery, HRV, resting HR, skin temp,
   strain, plus sleep). sleeps.csv also works. Upload one or both.

   WHOOP has renamed columns between versions, so we match headers
   by meaning (e.g. anything like "heart rate variability (ms)")
   instead of exact text.

   Which calendar day? WHOOP counts "cycles" from sleep to sleep. We
   file each row under the morning you woke up (Wake onset), so
   "sleep_hours" on a day means the sleep the night before it,
   matching the rest of the app. If there's no wake time we use the
   cycle start date.
   ============================================================ */

(function (root) {
  const CSV = root.RECEIPTS_CSV;
  const MODEL = root.RECEIPTS_MODEL;

  // field -> list of patterns matched against the normalized header key
  const COLUMNS = {
    recovery_score: [/^recoveryscore/],
    hrv_ms:         [/^heartratevariability/, /^hrv/],
    resting_hr_bpm: [/^restingheartrate/, /^rhr/],
    skin_temp_c:    [/^skintemp.*(celsius|c)$/, /^skintemp/],
    day_strain:     [/^daystrain/, /^strain$/],
    asleep_min:     [/^asleepduration/, /^totalsleepduration/],
    inbed_min:      [/^inbedduration/],
    wake:           [/^wakeonset/],
    nap:            [/^nap$/, /^isnap$/],
    cycle_start:    [/^cyclestarttime/, /^cyclestart/, /^date$/]
  };

  function findColumns(keys) {
    const map = {};
    Object.keys(COLUMNS).forEach(field => {
      const k = keys.find(k => COLUMNS[field].some(re => re.test(k)));
      if (k) map[field] = k;
    });
    return map;
  }

  // Does this look like a WHOOP export?
  function detect(text) {
    if (typeof text !== "string") return false;
    const firstLine = text.slice(0, 2000).split(/\r?\n/)[0] || "";
    const keys = (CSV.parse(firstLine)[0] || []).map(CSV.key);
    const cols = findColumns(keys);
    const hasDate = !!(cols.wake || cols.cycle_start);
    const hasMetric = !!(cols.recovery_score || cols.hrv_ms || cols.resting_hr_bpm || cols.asleep_min);
    return hasDate && hasMetric && /recovery|strain|asleep|cycle|whoop/i.test(firstLine);
  }

  // "2024-01-15 07:12:33" or "2024-01-15T07:12:33Z" -> "2024-01-15"
  function dateOf(value) {
    const m = String(value || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }

  function num(v) {
    if (v === undefined || v === null) return null;
    const cleaned = String(v).replace(/[%,\s]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  // Parse one or more WHOOP CSV texts. Returns a standard dataset.
  function parse(texts) {
    const list = Array.isArray(texts) ? texts : [texts];
    const rawDays = [];
    const notes = [];
    let skipped = 0;
    let inBedOnly = false;

    let naps = 0;
    list.forEach(text => {
      const { keys, records } = CSV.toObjects(text);
      const cols = findColumns(keys);
      records.forEach(r => {
        const date = dateOf(r[cols.wake]) || dateOf(r[cols.cycle_start]);
        if (!date) { skipped++; return; }
        // sleeps.csv lists naps as their own rows. A nap isn't "last night's
        // sleep", so skip it. (Found by reading WHOOP's export docs via MCP.)
        if (cols.nap && /^(true|yes|1)$/i.test(String(r[cols.nap]).trim())) { naps++; return; }
        const asleep = num(r[cols.asleep_min]);
        const inbed = num(r[cols.inbed_min]);
        const sleepMin = asleep !== null ? asleep : null; // in-bed time isn't sleep; don't substitute it
        rawDays.push({
          date,
          recovery_score: num(r[cols.recovery_score]),
          hrv_ms:         num(r[cols.hrv_ms]),
          resting_hr_bpm: num(r[cols.resting_hr_bpm]),
          skin_temp_c:    num(r[cols.skin_temp_c]),
          day_strain:     num(r[cols.day_strain]),
          sleep_hours:    sleepMin !== null ? sleepMin / 60 : null,
          steps:          null,
          cycle_day:      null
        });
        if (asleep === null && inbed !== null) inBedOnly = true;
      });
    });
    if (skipped) notes.push(`Skipped ${skipped} row(s) without a readable date.`);
    if (naps) notes.push(`Left out ${naps} nap(s), so sleep means your main sleep each night.`);
    if (inBedOnly) notes.push("Some nights only had time-in-bed, not time asleep, so sleep is left blank for those nights.");

    // Several rows can land on the same morning (e.g. naps without a Nap column,
    // or both CSVs uploaded). Keep the LONGEST sleep as that night's sleep, so a
    // short nap can never replace the main night.
    const longest = new Map();
    rawDays.forEach(d => {
      if (d.sleep_hours !== null && d.sleep_hours > (longest.get(d.date) || 0)) longest.set(d.date, d.sleep_hours);
    });
    rawDays.forEach(d => { if (longest.has(d.date)) d.sleep_hours = longest.get(d.date); });

    return MODEL.buildDataset(rawDays, {
      source: "whoop",
      label: "WHOOP export",
      hrvMethod: "RMSSD",
      notes: notes.slice()
    });
  }

  root.RECEIPTS_ADAPTER_WHOOP = { detect, parse, findColumns, dateOf };
})(typeof window !== "undefined" ? window : globalThis);
