/* ============================================================
   app.js — navigation, rendering, and wiring
   ------------------------------------------------------------
   Ties everything together: the first-run personalize flow, the
   five screens, the bottom nav, and re-rendering when the patient
   changes their symptom set.
   ============================================================ */

(function () {
  const DS = window.RECEIPTS_DATASOURCE;
  const SYM = window.RECEIPTS_SYMPTOMS;
  const ANALYSIS = window.RECEIPTS_ANALYSIS;
  const WRITER = window.RECEIPTS_WRITER;
  const CHARTS = window.RECEIPTS_CHARTS;

  // Current patient symptom set (loaded from localStorage or default).
  let symptomSet = SYM.loadSet();
  let editorSet = [];          // working copy while editing on screen 0
  let timelineVisible = { restingHr: true, hrv: true, sleep: true, steps: true };
  let briefAudience = "doctor";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- Navigation ----------
  function showScreen(id) {
    $$(".screen").forEach(s => { s.hidden = (s.id !== id); });
    const navId = id === "screen-watch" ? "screen-tap" : id; // watch lives under "Log"
    $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.screen === navId));
    // Lazy render per screen.
    if (id === "screen-tap") renderTapButtons();
    if (id === "screen-watch") renderWatch();
    if (id === "screen-timeline") renderTimeline();
    if (id === "screen-detective") renderDetective();
    if (id === "screen-today") renderToday();
    if (id === "screen-brief") renderBrief();
    window.scrollTo(0, 0);
  }

  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.screen));
  });

  // ---------- Screen 0: Personalize ----------
  function renderSymptomEditor() {
    const wrap = $("#symptom-editor");
    wrap.innerHTML = "";
    editorSet.forEach((s, idx) => {
      const chip = document.createElement("div");
      chip.className = "symptom-chip selected";
      chip.style.borderColor = s.color;
      chip.innerHTML =
        `<span class="chip-icon">${s.icon}</span>` +
        `<span class="chip-label">${escapeHtml(s.label)}</span>` +
        `<span class="chip-remove" aria-label="Remove ${escapeHtml(s.label)}">✕</span>`;
      chip.querySelector(".chip-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        editorSet.splice(idx, 1);
        renderSymptomEditor();
      });
      wrap.appendChild(chip);
    });

    // Offer library symptoms not already chosen.
    const chosenIds = new Set(editorSet.map(s => s.id));
    Object.keys(SYM.LIBRARY).forEach(id => {
      if (chosenIds.has(id)) return;
      const lib = SYM.LIBRARY[id];
      const chip = document.createElement("div");
      chip.className = "symptom-chip";
      chip.innerHTML = `<span class="chip-icon">${lib.icon}</span><span>${lib.label}</span><span class="chip-remove">＋</span>`;
      chip.addEventListener("click", () => {
        editorSet.push({ id, ...lib, custom: false });
        renderSymptomEditor();
      });
      wrap.appendChild(chip);
    });
  }

  // Suggest a starter set when the condition note changes.
  $("#condition-note").addEventListener("input", (e) => {
    const note = e.target.value;
    // Only auto-suggest if the user hasn't manually customized much yet.
    editorSet = SYM.suggestFromCondition(note);
    renderSymptomEditor();
  });

  $("#add-symptom-btn").addEventListener("click", addCustomSymptom);
  $("#new-symptom-name").addEventListener("keydown", (e) => { if (e.key === "Enter") addCustomSymptom(); });
  function addCustomSymptom() {
    const input = $("#new-symptom-name");
    const custom = SYM.makeCustom(input.value);
    if (custom) { editorSet.push(custom); input.value = ""; renderSymptomEditor(); }
  }

  $("#finish-setup-btn").addEventListener("click", () => {
    if (!editorSet.length) { editorSet = SYM.defaultSetObjects(); }
    symptomSet = editorSet.slice();
    SYM.saveSet(symptomSet);
    SYM.saveConditionNote($("#condition-note").value);
    showScreen("screen-connect"); // next: bring your wearable data (or use the demo)
  });

  $("#edit-symptoms-btn").addEventListener("click", () => {
    editorSet = symptomSet.slice();
    $("#condition-note").value = SYM.loadConditionNote();
    renderSymptomEditor();
    showScreen("screen-personalize");
  });

  // ---------- Screen 1: Symptom tap ----------
  function renderTapButtons() {
    $("#watch-time").textContent = nowLabel();
    const wrap = $("#tap-buttons");
    wrap.innerHTML = "";
    symptomSet.forEach(s => {
      const btn = document.createElement("button");
      btn.className = "tap-btn";
      btn.style.borderColor = hexA(s.color, 0.5);
      btn.innerHTML = `<span class="tap-icon">${s.icon}</span><span>${escapeHtml(s.label)}</span>`;
      btn.addEventListener("click", () => logTap(s));
      wrap.appendChild(btn);
    });
  }
  // ---------- Watch view ----------
  $("#open-watch-btn").addEventListener("click", () => showScreen("screen-watch"));
  $("#watch-to-timeline-btn").addEventListener("click", () => showScreen("screen-timeline"));
  let watchTimer = null;

  function renderWatch() {
    $("#watch-face-time").textContent = nowLabel().replace(/ (AM|PM)$/, "");
    $("#watch-face-done").hidden = true;
    $("#watch-to-timeline-btn").hidden = true;
    const grid = $("#watch-face-grid");
    grid.innerHTML = "";
    symptomSet.forEach(s => {
      const btn = document.createElement("button");
      btn.className = "watch-btn";
      btn.style.background = s.color;
      btn.setAttribute("aria-label", "Log " + s.label);
      btn.innerHTML = `<span class="watch-icon" aria-hidden="true">${s.icon}</span><span>${escapeHtml(s.label)}</span>`;
      btn.addEventListener("click", () => {
        DS.logTap(s.id);
        $("#watch-face-done-text").textContent = `${s.label} logged · ${nowLabel()}`;
        $("#watch-face-done").hidden = false;
        $("#watch-to-timeline-btn").hidden = false;
        clearTimeout(watchTimer);
        watchTimer = setTimeout(() => { $("#watch-face-done").hidden = true; }, 2200);
      });
      grid.appendChild(btn);
    });
  }

  function logTap(symptom) {
    DS.logTap(symptom.id);
    $("#tap-confirm").textContent = `Logged "${symptom.label}" at ${nowLabel()} \u2713 \u2014 it's on your timeline now`;
  }

  // ---------- Screen 2: Timeline ----------
  function renderTimeline() {
    const togglesWrap = $("#timeline-toggles");
    togglesWrap.innerHTML = "";
    // Only offer toggles for metrics this data actually has.
    const SHORT = { restingHr: "Resting HR", hrv: "HRV", sleep: "Sleep", steps: "Steps" };
    const D = DS.get();
    const toggles = CHARTS.availableLines(D).map(l => ({ key: l.key, label: SHORT[l.key] }));
    const missing = CHARTS.LINES.filter(l => !D.availability[l.field]).map(l => SHORT[l.key]);
    const note = $("#timeline-missing");
    note.textContent = missing.length
      ? `Not in this data: ${missing.join(", ")}. We only show what your device recorded.`
      : "";
    $("#timeline-title").textContent = `Your last ${D.daily.length} days`;
    toggles.forEach(t => {
      const b = document.createElement("button");
      b.className = "chart-toggle" + (timelineVisible[t.key] ? "" : " off");
      b.textContent = t.label;
      b.addEventListener("click", () => {
        timelineVisible[t.key] = !timelineVisible[t.key];
        renderTimeline();
      });
      togglesWrap.appendChild(b);
    });

    CHARTS.renderTimeline("timeline-chart", timelineVisible, symptomSet);

    // Legend of the patient's symptoms.
    const legend = $("#timeline-legend");
    legend.innerHTML = "";
    symptomSet.forEach(s => {
      const item = document.createElement("span");
      item.className = "legend-item";
      item.innerHTML = `<span class="legend-dot" style="background:${s.color}"></span>${s.icon} ${escapeHtml(s.label)}`;
      legend.appendChild(item);
    });
  }

  // ---------- Screen 3: Trigger Detective ----------
  function renderDetective() {
    const findings = ANALYSIS.runDetective();
    const list = $("#findings-list");
    list.innerHTML = "";

    // Plainly say which insights this data can't support, and why.
    const unavailable = ANALYSIS.insightStatus().filter(s => !s.available);
    const missingHtml = unavailable.length
      ? `<div class="missing-box"><h3>Not available with this data</h3><ul>` +
        unavailable.map(s => `<li><strong>${escapeHtml(s.label)}:</strong> ${escapeHtml(s.reason)}</li>`).join("") +
        `</ul></div>`
      : "";

    if (!findings.length) {
      list.innerHTML = `<p class="muted">We don't see a strong pattern yet. Keep logging — patterns
        become clearer with more taps.</p>` + missingHtml;
      return;
    }

    findings.forEach((f, i) => {
      const sentence = WRITER.writeFinding(f);
      const card = document.createElement("div");
      card.className = "finding";
      const canvasId = "mini-" + i;
      card.innerHTML =
        `<h3>${escapeHtml(f.title)}</h3>` +
        `<span class="baseline-tag">compared to your own baseline</span>` +
        `<p class="finding-sentence">${escapeHtml(sentence)}</p>` +
        `<div class="mini-chart-wrap"><canvas id="${canvasId}"></canvas></div>` +
        (f.source ? `<p class="source-note">${escapeHtml(f.source.label)} ` +
          `<a href="${f.source.url}" target="_blank" rel="noopener">source</a></p>` : "");
      list.appendChild(card);
      CHARTS.renderMini(canvasId, f.chart);
    });
    if (missingHtml) list.insertAdjacentHTML("beforeend", missingHtml);
  }

  // ---------- Screen 4: Today ----------
  function renderToday() {
    const result = ANALYSIS.todayScore();
    const msg = WRITER.writeTodayMessage(result);
    const wrap = $("#today-content");
    const noData = result.checked.length === 0;
    const cls = noData ? "neutral" : (result.pacing ? "pace" : "good");
    const headline = noData ? "Not enough data for today"
      : (result.pacing ? "Looks like a pacing day" : "Looks like a good day");
    wrap.innerHTML =
      `<div class="today-banner ${cls}">${headline}</div>` +
      `<p class="today-why">${escapeHtml(msg)}</p>` +
      `<p class="disclaimer-note">This is not a diagnosis — your clinician decides.</p>`;
  }

  // ---------- Screen 5: Brief ----------
  $("#toggle-doctor").addEventListener("click", () => { briefAudience = "doctor"; setToggle(); renderBrief(); });
  $("#toggle-patient").addEventListener("click", () => { briefAudience = "patient"; setToggle(); renderBrief(); });
  function setToggle() {
    $("#toggle-doctor").classList.toggle("active", briefAudience === "doctor");
    $("#toggle-patient").classList.toggle("active", briefAudience === "patient");
    $("#toggle-doctor").setAttribute("aria-selected", briefAudience === "doctor");
    $("#toggle-patient").setAttribute("aria-selected", briefAudience === "patient");
  }

  $("#send-doctor-btn").addEventListener("click", () => {
    $("#send-confirm").textContent = "Your brief is ready to share — (demo) sent to your doctor ✓";
  });
  $("#print-brief-btn").addEventListener("click", () => window.print());

  function renderBrief() {
    const findings = ANALYSIS.runDetective();
    const todayResult = ANALYSIS.todayScore();
    const brief = WRITER.writeBrief(findings, todayResult, briefAudience);
    const page = $("#brief-page");

    const D = DS.get();
    const n = D.daily.length;
    const ageBit = D.patient.age ? ` (age ${D.patient.age})` : "";
    const whoLine = briefAudience === "doctor"
      ? `Patient: ${D.patient.name}${ageBit} · ${n}-day wearable summary · source: ${D.label}`
      : `Your ${n}-day summary, ${D.patient.name}`;

    let html =
      `<div class="brief-head">` +
      `<h2>${briefAudience === "doctor" ? "Pre-Appointment Brief" : "Your Health Receipts"}</h2>` +
      `<p class="who">${escapeHtml(whoLine)}</p>` +
      `<p>${escapeHtml(brief.intro)}</p>` +
      `</div>`;

    brief.patterns.forEach((p, i) => {
      const canvasId = "brief-mini-" + i;
      html +=
        `<div class="brief-pattern">` +
        `<h3>${escapeHtml(p.title)}</h3>` +
        `<p>${escapeHtml(p.sentence)}</p>` +
        `<div class="mini-chart-wrap"><canvas id="${canvasId}"></canvas></div>` +
        (p.source ? `<p class="source-note">${escapeHtml(p.source.label)}</p>` : "") +
        (p.question ? `<div class="brief-question">Suggested question: ${escapeHtml(p.question)}</div>` : "") +
        `</div>`;
    });

    if (briefAudience === "patient" && brief.patientQuestions.length) {
      html += `<h3>3 questions to ask your doctor</h3><ul class="brief-questions-list">`;
      brief.patientQuestions.forEach(q => { html += `<li>${escapeHtml(q)}</li>`; });
      html += `</ul>`;
    }

    html += `<p class="disclaimer-note">${escapeHtml(brief.disclaimer)}</p>`;
    page.innerHTML = html;

    // Render the mini-charts after the HTML is in the DOM.
    brief.patterns.forEach((p, i) => CHARTS.renderMini("brief-mini-" + i, p.chart));
  }

  // ---------- Connect your wearable ----------
  const WHOOP = window.RECEIPTS_ADAPTER_WHOOP;
  const APPLE = window.RECEIPTS_ADAPTER_APPLE;
  const MODEL = window.RECEIPTS_MODEL;

  $("#data-chip").addEventListener("click", () => showScreen("screen-connect"));
  DS.onChange(ds => { $("#data-chip-label").textContent = ds.label; });

  $("#use-demo-btn").addEventListener("click", () => {
    DS.useDemo();
    $("#upload-result").innerHTML = "";
    setUploadStatus("Using Maya's demo data.");
    showScreen("screen-tap");
  });

  $("#whoop-connect-btn").addEventListener("click", () => {
    const panel = $("#whoop-soon");
    panel.hidden = !panel.hidden;
    $("#whoop-connect-btn").setAttribute("aria-expanded", String(!panel.hidden));
  });

  $("#upload-input").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow choosing the same file again
    if (!files.length) return;
    $("#upload-result").innerHTML = "";
    try {
      const ds = await readExport(files);
      DS.useUploaded(ds);
      showUploadResult(ds);
      setUploadStatus(`Loaded ${ds.daily.length} days from your ${ds.label}.`);
    } catch (err) {
      setUploadStatus(err.message || "Something went wrong reading that file.", true);
    } finally {
      setProgress(null);
    }
  });

  // Figure out what kind of file this is and send it to the right adapter.
  async function readExport(files) {
    const name = f => f.name.toLowerCase();
    const zip = files.find(f => name(f).endsWith(".zip"));
    const xml = files.find(f => name(f).endsWith(".xml"));
    const csvs = files.filter(f => name(f).endsWith(".csv"));

    if (zip || xml) {
      const file = zip || xml;
      if (xml && /export_cda/.test(name(xml))) {
        throw new Error("That's export_cda.xml (clinical documents). Choose export.xml from the same folder instead.");
      }
      setUploadStatus(`Reading ${file.name} on your device… big files can take a minute.`);
      setProgress(0);
      const ds = zip ? await APPLE.parseZip(file, setProgress) : await APPLE.parseFile(file, setProgress);
      if (!ds.daily.length) throw new Error("We read the file but didn't find any days with heart rate, HRV, sleep, steps, or cycle data.");
      return ds;
    }

    if (csvs.length) {
      setUploadStatus("Reading your WHOOP file(s) on your device…");
      const texts = await Promise.all(csvs.map(f => f.text()));
      const whoopTexts = texts.filter(t => WHOOP.detect(t));
      if (!whoopTexts.length) {
        throw new Error("We couldn't recognize that CSV. Receipts reads WHOOP's physiological_cycles.csv or sleeps.csv.");
      }
      const ds = WHOOP.parse(whoopTexts);
      if (!ds.daily.length) throw new Error("That WHOOP file didn't have any days we could read.");
      return ds;
    }

    throw new Error("Please choose a WHOOP .csv, or an Apple Health export.zip or export.xml.");
  }

  function showUploadResult(ds) {
    const have = MODEL.FIELDS.filter(f => ds.availability[f]).map(f => MODEL.LABELS[f]);
    const missing = MODEL.missingMetrics(ds).map(m => m.label);
    const first = ds.daily[0].date, last = ds.daily[ds.daily.length - 1].date;
    const unavailable = ANALYSIS.insightStatus().filter(s => !s.available);
    $("#upload-result").innerHTML =
      `<div class="result-box">` +
      `<p><strong>${ds.daily.length} days</strong> (${first} to ${last}) from your ${escapeHtml(ds.label)}.</p>` +
      `<p><strong>Found:</strong> ${have.length ? escapeHtml(have.join(", ")) : "nothing we use yet"}.</p>` +
      (missing.length ? `<p><strong>Not in this file:</strong> ${escapeHtml(missing.join(", "))}.</p>` : "") +
      (unavailable.length
        ? `<p>So these insights aren't available yet:</p><ul>` +
          unavailable.map(s => `<li>${escapeHtml(s.label)} — ${escapeHtml(s.reason)}</li>`).join("") + `</ul>`
        : "") +
      (ds.notes.length ? `<p class="hint">${escapeHtml(ds.notes.join(" "))}</p>` : "") +
      `<button class="btn btn-primary" id="goto-timeline-btn">See my timeline</button>` +
      `</div>`;
    $("#goto-timeline-btn").addEventListener("click", () => showScreen("screen-timeline"));
  }

  function setUploadStatus(msg, isError) {
    const el = $("#upload-status");
    el.textContent = msg;
    el.classList.toggle("error", !!isError);
  }
  function setProgress(fraction) {
    const wrap = $("#upload-progress");
    if (fraction === null) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $("#upload-progress-bar").style.width = Math.round(fraction * 100) + "%";
  }

  // ---------- helpers ----------
  function nowLabel() {
    const d = new Date();
    let h = d.getHours(), m = d.getMinutes();
    const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ap}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function hexA(hex, a) {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ---------- First-run flow ----------
  function init() {
    setToggle();
    const hasSaved = !!localStorage.getItem("receipts.symptomSet.v1");
    if (hasSaved) {
      // Returning user: skip straight to the tap screen.
      showScreen("screen-tap");
    } else {
      // First run: start on personalize with the default set.
      editorSet = SYM.defaultSetObjects();
      renderSymptomEditor();
      showScreen("screen-personalize");
    }
  }

  init();

  // expose for console/debugging during the demo
  window.RECEIPTS_APP = { showScreen };
})();
