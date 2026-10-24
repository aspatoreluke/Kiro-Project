/* ============================================================
   charts.js — Chart.js helpers
   ------------------------------------------------------------
   Builds the 60-day timeline (resting HR, HRV, sleep) with symptom
   taps marked on top, plus the small per-finding mini-charts.
   Calm blue palette, large readable text.
   ============================================================ */

(function () {
  const D = window.RECEIPTS_DATA;
  const SYM = window.RECEIPTS_SYMPTOMS;

  const BLUE = "#1B3A5B", MIDBLUE = "#3E7CB1", LIGHTBLUE = "#6BA8D6";
  const charts = {}; // keep references so we can destroy/rebuild

  function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

  Chart.defaults.font.size = 14;
  Chart.defaults.color = "#46617A";

  // ---- 60-day timeline ----
  function renderTimeline(canvasId, visible, symptomSet) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext("2d");
    const labels = D.daily.map(d => d.date.slice(5)); // MM-DD

    const datasets = [];
    if (visible.restingHr) datasets.push({
      label: "Resting HR (bpm)", data: D.daily.map(d => d.resting_hr_bpm),
      borderColor: BLUE, backgroundColor: BLUE, tension: 0.3, pointRadius: 0, borderWidth: 2, yAxisID: "y"
    });
    if (visible.hrv) datasets.push({
      label: "HRV (ms)", data: D.daily.map(d => d.hrv_rmssd_ms),
      borderColor: MIDBLUE, backgroundColor: MIDBLUE, tension: 0.3, pointRadius: 0, borderWidth: 2, yAxisID: "y"
    });
    if (visible.sleep) datasets.push({
      label: "Sleep (h)", data: D.daily.map(d => d.sleep_hours),
      borderColor: LIGHTBLUE, backgroundColor: LIGHTBLUE, tension: 0.3, pointRadius: 0, borderWidth: 2, yAxisID: "y1"
    });

    // Symptom taps as scatter points near the top of the chart.
    const tapPoints = {};
    D.symptomTaps.forEach(tap => {
      const x = D.daily.findIndex(d => d.date === tap.date);
      if (x < 0) return;
      const info = SYM.lookup(tap.symptom_id, symptomSet);
      if (!tapPoints[tap.symptom_id]) tapPoints[tap.symptom_id] = { info, pts: [] };
      tapPoints[tap.symptom_id].pts.push({ x, y: 100 });
    });
    Object.values(tapPoints).forEach(group => {
      datasets.push({
        type: "scatter",
        label: group.info.label,
        data: group.pts,
        borderColor: group.info.color,
        backgroundColor: group.info.color,
        pointRadius: 5, pointStyle: "triangle", yAxisID: "y"
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
          y: { position: "left", grid: { color: "#EAF1F8" }, title: { display: true, text: "HR / HRV" } },
          y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Sleep (h)" }, suggestedMin: 0, suggestedMax: 10 }
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

  window.RECEIPTS_CHARTS = { renderTimeline, renderMini, destroy };
})();
