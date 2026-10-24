/* ============================================================
   apple-health.js — Apple Health export  ->  standard daily model
   ------------------------------------------------------------
   iPhone Health app -> profile -> Export All Health Data gives
   export.zip, containing apple_health_export/export.xml. That file
   is often HUNDREDS of MB (every reading since you got the phone),
   so we never load it whole. We read it in slices and only keep the
   few record types Receipts uses:

     RestingHeartRate            -> resting_hr_bpm (daily average)
     HeartRateVariabilitySDNN    -> hrv_ms         (daily average, SDNN)
     StepCount                   -> steps          (see note below)
     SleepAnalysis (asleep only) -> sleep_hours    (filed under wake-up day)
     AppleSleepingWristTemperature -> skin_temp_c
     MenstrualFlow               -> cycle_day      (days since period started)

   Everything else (and personal details like date of birth) is
   skipped without being stored.

   Double counting: an iPhone AND an Apple Watch both log steps and
   sleep for the same time. Adding them would double your steps. So
   for each day we total each device separately and keep the device
   with the most — never the sum.

   Runs 100% in the browser (or in Node for tests). Nothing is sent
   anywhere.
   ============================================================ */

(function (root) {
  const MODEL = root.RECEIPTS_MODEL;

  const T = {
    RHR:   "HKQuantityTypeIdentifierRestingHeartRate",
    HRV:   "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    STEPS: "HKQuantityTypeIdentifierStepCount",
    SLEEP: "HKCategoryTypeIdentifierSleepAnalysis",
    TEMP:  "HKQuantityTypeIdentifierAppleSleepingWristTemperature",
    FLOW:  "HKCategoryTypeIdentifierMenstrualFlow"
  };
  const WANTED = new Set(Object.values(T));

  // Sleep values that mean "actually asleep" (not "in bed" or "awake").
  const ASLEEP = /SleepAnalysisAsleep/; // Asleep, AsleepUnspecified, AsleepCore, AsleepDeep, AsleepREM

  const RECORD_RE = /<Record\b([^>]*)>/g;
  const ATTR = {
    type:   /\btype="([^"]*)"/,
    source: /\bsourceName="([^"]*)"/,
    unit:   /\bunit="([^"]*)"/,
    start:  /\bstartDate="([^"]*)"/,
    end:    /\bendDate="([^"]*)"/,
    value:  /\bvalue="([^"]*)"/
  };
  function attr(s, name) { const m = ATTR[name].exec(s); return m ? m[1] : null; }

  // "2024-01-15 07:12:33 -0500" -> "2024-01-15" (the person's local date)
  function localDate(s) { return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; }
  // Parse Apple's timestamp to milliseconds (for durations).
  function toMs(s) {
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(s || "");
    if (!m) return NaN;
    return Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
  }

  function detect(firstChunk) {
    if (typeof firstChunk !== "string") return false;
    const head = firstChunk.slice(0, 5000);
    return /<HealthData\b/.test(head) || /HealthKit Export/i.test(head);
  }

  // A streaming parser. push() text in any size pieces; finish() returns the dataset.
  function createParser() {
    let carry = "";
    const avg = { rhr: new Map(), hrv: new Map(), temp: new Map() };       // date -> [sum, count]
    const perSource = { steps: new Map(), sleepMin: new Map() };            // date -> Map(source -> total)
    const flowDays = new Set();
    let recordsSeen = 0, recordsUsed = 0, bad = 0;

    function addAvg(map, date, v) {
      const cur = map.get(date) || [0, 0];
      cur[0] += v; cur[1] += 1; map.set(date, cur);
    }
    function addSource(map, date, source, v) {
      let m = map.get(date);
      if (!m) { m = new Map(); map.set(date, m); }
      m.set(source, (m.get(source) || 0) + v);
    }

    function handle(attrs) {
      recordsSeen++;
      const type = attr(attrs, "type");
      if (!type || !WANTED.has(type)) return;
      const start = attr(attrs, "start");
      const date = localDate(start);
      if (!date) { bad++; return; }
      const value = attr(attrs, "value");
      const source = attr(attrs, "source") || "unknown";

      if (type === T.SLEEP) {
        if (!value || !ASLEEP.test(value)) return;
        const end = attr(attrs, "end");
        const mins = (toMs(end) - toMs(start)) / 60000;
        if (!Number.isFinite(mins) || mins <= 0 || mins > 24 * 60) { bad++; return; }
        addSource(perSource.sleepMin, localDate(end) || date, source, mins);
        recordsUsed++;
        return;
      }
      if (type === T.FLOW) {
        if (value && !/MenstrualFlowNone/.test(value)) { flowDays.add(date); recordsUsed++; }
        return;
      }
      const n = Number(value);
      if (!Number.isFinite(n)) { bad++; return; }
      if (type === T.STEPS) addSource(perSource.steps, date, source, n);
      else if (type === T.RHR) addAvg(avg.rhr, date, n);
      else if (type === T.HRV) addAvg(avg.hrv, date, n);
      else if (type === T.TEMP) {
        const unit = attr(attrs, "unit") || "degC";
        addAvg(avg.temp, date, /F/i.test(unit) ? (n - 32) * 5 / 9 : n);
      }
      recordsUsed++;
    }

    function push(text) {
      const s = carry + text;
      const cut = s.lastIndexOf(">");
      if (cut < 0) { carry = s; return; }
      const complete = s.slice(0, cut + 1);
      carry = s.slice(cut + 1);
      RECORD_RE.lastIndex = 0;
      let m;
      while ((m = RECORD_RE.exec(complete))) handle(m[1]);
      // Guard against a pathological file with no '>' for a long time.
      if (carry.length > 1e6) carry = carry.slice(-1e5);
    }

    // Day number since a period started (day 1 = first flow day after a gap).
    function cycleDays(dates) {
      const flow = Array.from(flowDays).sort();
      const starts = [];
      const DAY = 86400000;
      let prev = null;
      flow.forEach(d => {
        const t = Date.parse(d + "T00:00:00Z");
        if (prev === null || t - prev > 10 * DAY) starts.push(t);
        prev = t;
      });
      const out = new Map();
      if (!starts.length) return out;
      dates.forEach(d => {
        const t = Date.parse(d + "T00:00:00Z");
        let last = null;
        for (const s of starts) { if (s <= t) last = s; else break; }
        if (last === null) return;
        const n = Math.round((t - last) / DAY) + 1;
        if (n >= 1 && n <= 60) out.set(d, n);
      });
      return out;
    }

    function finish() {
      if (carry) push(">"); // flush anything left
      const dates = new Set();
      [avg.rhr, avg.hrv, avg.temp, perSource.steps, perSource.sleepMin].forEach(m => m.forEach((_, d) => dates.add(d)));
      flowDays.forEach(d => dates.add(d));
      const sorted = Array.from(dates).sort();
      const cycle = cycleDays(sorted);
      const mean = (map, d) => { const v = map.get(d); return v ? v[0] / v[1] : null; };
      const maxSource = (map, d) => { const m = map.get(d); return m ? Math.max(...m.values()) : null; };

      const rawDays = sorted.map(d => {
        const sleepMin = maxSource(perSource.sleepMin, d);
        return {
          date: d,
          recovery_score: null,
          day_strain: null,
          resting_hr_bpm: mean(avg.rhr, d),
          hrv_ms:         mean(avg.hrv, d),
          skin_temp_c:    mean(avg.temp, d),
          steps:          maxSource(perSource.steps, d),
          sleep_hours:    sleepMin !== null ? sleepMin / 60 : null,
          cycle_day:      cycle.has(d) ? cycle.get(d) : null
        };
      });

      const notes = [];
      if (bad) notes.push(`Skipped ${bad} unreadable reading(s).`);
      const ds = MODEL.buildDataset(rawDays, {
        source: "apple-health",
        label: "Apple Health export",
        hrvMethod: "SDNN",
        windowDays: 90,
        notes
      });
      ds.stats = { recordsSeen, recordsUsed, daysTotal: sorted.length };
      return ds;
    }

    return { push, finish };
  }

  // Convenience for small inputs (tests): parse a whole string at once.
  function parseText(text) {
    const p = createParser();
    p.push(String(text || ""));
    return p.finish();
  }

  // ---- Browser helpers ----
  const CHUNK = 8 * 1024 * 1024; // 8 MB at a time
  const tick = () => new Promise(r => setTimeout(r, 0)); // let the page breathe

  // Read a File/Blob of export.xml in slices. onProgress(0..1).
  async function parseFile(file, onProgress) {
    const p = createParser();
    const decoder = new TextDecoder("utf-8");
    let first = true;
    for (let pos = 0; pos < file.size; pos += CHUNK) {
      const buf = await file.slice(pos, pos + CHUNK).arrayBuffer();
      const text = decoder.decode(buf, { stream: pos + CHUNK < file.size });
      if (first) {
        first = false;
        if (!detect(text)) throw new Error("This doesn't look like an Apple Health export.xml file.");
      }
      p.push(text);
      if (onProgress) onProgress(Math.min(1, (pos + CHUNK) / file.size));
      await tick();
    }
    return p.finish();
  }

  // export.zip straight from the iPhone: unzip in the browser and stream export.xml.
  async function parseZip(file, onProgress) {
    if (!root.JSZip) await loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
    const zip = await root.JSZip.loadAsync(file);
    const entry = zip.file(/(^|\/)export\.xml$/)[0];
    if (!entry) throw new Error("Couldn't find export.xml inside that zip.");
    const p = createParser();
    const decoder = new TextDecoder("utf-8");
    let first = true;
    await new Promise((resolve, reject) => {
      entry.internalStream("uint8array")
        .on("data", (chunk, meta) => {
          const text = decoder.decode(chunk, { stream: true });
          if (first) {
            first = false;
            if (!detect(text)) { reject(new Error("export.xml in that zip doesn't look like Apple Health data.")); return; }
          }
          p.push(text);
          if (onProgress && meta && typeof meta.percent === "number") onProgress(meta.percent / 100);
        })
        .on("error", reject)
        .on("end", resolve)
        .resume();
    });
    return p.finish();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve;
      // Integrity check: the browser refuses the file if the CDN copy ever changes.
      s.integrity = "sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG";
      s.crossOrigin = "anonymous";
      s.onerror = () => reject(new Error("Couldn't load the unzip helper. Unzip the file yourself and upload export.xml instead."));
      document.head.appendChild(s);
    });
  }

  root.RECEIPTS_ADAPTER_APPLE = { detect, createParser, parseText, parseFile, parseZip, TYPES: T };
})(typeof window !== "undefined" ? window : globalThis);
