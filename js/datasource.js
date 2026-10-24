/* ============================================================
   datasource.js — which data is the app looking at right now?
   ------------------------------------------------------------
   One switch: Maya's demo data (default, so the demo never breaks)
   or a dataset the patient uploaded from their own wearable.

   Every screen reads through RECEIPTS_DATASOURCE.get(), so nothing
   else in the app knows or cares which device the data came from.

   PRIVACY: uploaded data lives only in this page's memory. It is
   never sent anywhere and never saved — refreshing clears it.
   Symptom taps logged during a session are also memory-only.
   ============================================================ */

(function (root) {
  const MODEL = root.RECEIPTS_MODEL;
  const DEMO = root.RECEIPTS_DATA; // Maya's synthetic WHOOP-shaped dataset

  const DAY_MS = 86400000;
  function dayNum(date) { return Math.round(Date.parse(date + "T00:00:00Z") / DAY_MS); }

  // Mark each day as in "the week before a period" (true/false), or null
  // when there's no cycle data for that day. Uses the person's OWN average
  // cycle length (from their period start days), so it works for any cycle,
  // not just 28 days.
  function annotateCycle(daily) {
    const starts = daily.filter(d => d.cycle_day === 1).map(d => dayNum(d.date));
    let cycleLen = 28;
    if (starts.length >= 2) {
      const gaps = [];
      for (let i = 1; i < starts.length; i++) gaps.push(starts[i] - starts[i - 1]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avg >= 15 && avg <= 60) cycleLen = Math.round(avg);
    }
    daily.forEach(d => {
      if (d.cycle_day == null) { d.premenstrual = null; return; }
      const n = dayNum(d.date);
      const actualNext = starts.find(s => s > n);
      // If we haven't seen the next period yet, estimate it from their own cycle length.
      const next = actualNext !== undefined ? actualNext : n + Math.max(1, cycleLen - d.cycle_day + 1);
      const daysUntil = next - n;
      d.premenstrual = daysUntil >= 1 && daysUntil <= 7;
    });
    return daily;
  }

  // Turn Maya's demo data into the same standard dataset shape uploads use.
  function demoDataset() {
    const ds = MODEL.buildDataset(DEMO.daily, {
      source: "demo",
      label: "Maya (demo data)",
      hrvMethod: "RMSSD",
      patient: DEMO.patient,
      symptomTaps: DEMO.symptomTaps,
      standingEvents: DEMO.standingEvents,
      windowDays: 9999
    });
    annotateCycle(ds.daily);
    return ds;
  }

  let active = demoDataset();
  let sessionTaps = [];          // taps logged this session (memory only)
  const listeners = [];

  function notify() { listeners.forEach(fn => { try { fn(active); } catch (e) { console.error(e); } }); }

  function get() {
    // Return the dataset with this session's taps merged in.
    return Object.assign({}, active, { symptomTaps: active.symptomTaps.concat(sessionTaps) });
  }

  function useDemo() { active = demoDataset(); sessionTaps = []; notify(); }

  function useUploaded(dataset) {
    if (!dataset || !Array.isArray(dataset.daily) || !dataset.daily.length) {
      throw new Error("That file didn't contain any days we could read.");
    }
    annotateCycle(dataset.daily);
    active = dataset;
    sessionTaps = [];
    notify();
  }

  function isDemo() { return active.source === "demo"; }

  // Log a symptom tap. It's attached to the most recent day in the active
  // data so it shows up on the timeline (for the demo, Maya's "today").
  function logTap(symptomId) {
    const latest = active.daily[active.daily.length - 1];
    if (!latest) return null;
    const tap = {
      datetime: new Date().toISOString(),
      date: latest.date,
      symptom_id: symptomId,
      severity: null,
      note: null,
      live: true // logged in this session (shown highlighted)
    };
    sessionTaps.push(tap);
    notify();
    return tap;
  }

  function onChange(fn) { listeners.push(fn); }

  root.RECEIPTS_DATASOURCE = {
    get, useDemo, useUploaded, isDemo, logTap, onChange, annotateCycle,
    sources: DEMO.sources // honest real-world citations (not anyone's data)
  };
})(typeof window !== "undefined" ? window : globalThis);
