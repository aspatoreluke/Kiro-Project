/* ============================================================
   charts.js — Chart.js helpers
   ------------------------------------------------------------
   Builds the 60-day timeline (resting HR, HRV, sleep) with symptom
   taps marked on top, plus the small per-finding mini-charts.
   Calm blue palette, large readable text.
   ============================================================ */

(function () {
  const DS = window.RECEIPTS_DATASOURCE;
  const SYM = window.RECEIPTS_SYMPTOMS;

  const BLUE = "#1B3A5B", MIDBLUE = "#3E7CB1", LIGHTBLUE = "#6BA8D6";
  const charts = {}; // keep references so we can destroy/rebuild

  function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

  Chart.defaults.font.size = 14;
  Chart.defaults.color = "#46617A";

  // ---- 60-day timeline ----
  // Lines the timeline can draw. Each is only offered if the data has it.
  const LINES = [
    { key: "restingHr", field: "resting_hr_bpm", label: "Resting HR (bpm)", color: BLUE,      axis: "y" },
    { key: "hrv",       field: "hrv_ms",         label: "HRV (ms)",         color: MIDBLUE,   axis: "y" },
    { key: "sleep",     field: "sleep_hours",    label: "Sleep (h)",        color: LIGHTBLUE, axis: "y1" },
    { key: "steps",     field: "steps",          label: "Steps",            color: "#5BA38A", axis: "y2" }
  ];

  function availableLines(D) {
    return LINES.filter(l => D.availability && D.availability[l.field]);
  }

  function renderTimeline(canvasId, visible, symptomSet) {
    destroy(canvasId);
    const D = DS.get();
    const ctx = document.getElementById(canvasId).getContext("2d");
    const labels = D.daily.map(d => d.date.slice(5)); // MM-DD

    const datasets = [];
    const shown = availableLines(D).filter(l => visible[l.key] !== false);
    shown.forEach(l => datasets.push({
      label: l.label, data: D.daily.map(d => d[l.field]),
      borderColor: l.color, backgroundColor: l.color, tension: 0.3, pointRadius: 0, borderWidth: 2,
      yAxisID: l.axis, spanGaps: false
    }));
    const usesAxis = (ax) => shown.some(l => l.axis === ax);

    // Symptom taps as markers along the top of the chart. Taps logged in this
    // session (e.g. from the watch view) are drawn bigger so they're easy to spot.
    const tapPoints = {};
    D.symptomTaps.forEach(tap => {
      const x = D.daily.findIndex(d => d.date === tap.date);
      if (x < 0) return;
      const key = tap.symptom_id + (tap.live ? "__live" : "");
      const info = SYM.lookup(tap.symptom_id, symptomSet);
      if (!tapPoints[key]) tapPoints[key] = { info, live: !!tap.live, pts: [] };
      tapPoints[key].pts.push({ x: labels[x], y: 1 });
    });
    Object.values(tapPoints).forEach(group => {
      datasets.push({
        type: "scatter",
        label: group.info.label + (group.live ? " (just logged)" : ""),
        data: group.pts,
        borderColor: group.live ? "#16293B" : group.info.color,
        backgroundColor: group.info.color,
        borderWidth: group.live ? 3 : 1,
        pointRadius: group.live ? 11 : 5,
        pointStyle: group.live ? "star" : "triangle",
        yAxisID: "taps"
      });
    });

    charts[canvasId] = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: (items) => "Day " + items[0].label
          } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8 }, grid: { color: "#EAF1F8" } },
          y: { display: usesAxis("y"), position: "left", grid: { color: "#EAF1F8" }, title: { display: true, text: "HR / HRV" } },
          y1: { display: usesAxis("y1"), position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Sleep (h)" }, suggestedMin: 0, suggestedMax: 10 },
          y2: { display: usesAxis("y2") && !usesAxis("y1"), position: "right", grid: { drawOnChartArea: !usesAxis("y") }, title: { display: true, text: "Steps" }, beginAtZero: true },
          // Hidden lane at the top of the chart where symptom markers sit.
          taps: { display: false, min: 0, max: 1.08 }
        }
      }
    });
  }

  // ---- Mini-chart for a finding ----
  function renderMini(canvasId, chartSpec) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext("2d");

    if (chartSpec.type === "doughnut") {
      charts[canvasId] = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: chartSpec.labels,
          datasets: [{ data: chartSpec.values, backgroundColor: [BLUE, LIGHTBLUE] }]
        },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } } }
      });
      return;
    }

    // bar chart with a reference line (e.g., 30 bpm or 6 h)
    const colors = chartSpec.values.map(v =>
      (chartSpec.reference != null)
        ? ((chartSpec.yLabel || "").indexOf("Sleep") >= 0
            ? (v < chartSpec.reference ? MIDBLUE : LIGHTBLUE)
            : (v >= chartSpec.reference ? MIDBLUE : LIGHTBLUE))
        : MIDBLUE
    );

    charts[canvasId] = new Chart(ctx, {
      type: "bar",
      data: { labels: chartSpec.labels, datasets: [{ data: chartSpec.values, backgroundColor: colors }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          annotation: false
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
          y: { grid: { color: "#EAF1F8" }, title: { display: true, text: chartSpec.yLabel || "" },
               beginAtZero: true }
        }
      },
      plugins: [refLinePlugin(chartSpec.reference)]
    });
  }

  // Draws a dashed reference line across a bar chart (e.g. the 30 bpm / 6 h marker).
  function refLinePlugin(refValue) {
    return {
      id: "refline_" + Math.random().toString(36).slice(2),
      afterDraw(chart) {
        if (refValue == null) return;
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        const yPos = y.getPixelForValue(refValue);
        ctx.save();
        ctx.strokeStyle = "#B15B7C"; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(left, yPos); ctx.lineTo(right, yPos); ctx.stroke();
        ctx.restore();
      }
    };
  }

  window.RECEIPTS_CHARTS = { renderTimeline, renderMini, destroy, availableLines, LINES };
})();
