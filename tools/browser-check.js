#!/usr/bin/env node
/* Opens the app in headless Chrome (no extra installs: it talks to Chrome
   over its built-in DevTools protocol using Node's own WebSocket) and runs a
   scripted walk-through. Prints PASS/FAIL lines plus any page errors.

   Usage: node tools/browser-check.js [url] [path-to-upload]
*/
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const URL_TO_TEST = process.argv[2] || "http://127.0.0.1:8765/";
const UPLOAD = process.argv[3] ? path.resolve(process.argv[3]) : null;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "receipts-chrome-")); // fresh browser, no saved state

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=390,844", "about:blank"
], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, nextId = 1;
const pending = new Map();
const errors = [];
let fails = 0;

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
// Optional screenshots: set SHOTS=/some/folder
async function shot(name) {
  if (!process.env.SHOTS) return;
  await sleep(500);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(process.env.SHOTS, name + ".png"), Buffer.from(data, "base64"));
}
function check(name, ok, detail) {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail !== undefined ? "  -> " + detail : ""}`);
}
async function waitFor(expr, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await evaluate(expr)) return true; await sleep(100); }
  return false;
}

(async () => {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find(t => t.type === "page");
    } catch (e) { await sleep(200); }
  }
  if (!target) throw new Error("Chrome didn't start");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push(msg.params.args.map(a => a.value || a.description).join(" "));
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      errors.push(msg.params.entry.text + " " + (msg.params.entry.url || ""));
    }
  });
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable"); await send("DOM.enable");
  // Behave like a phone (iPhone 14-sized screen, touch).
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.navigate", { url: URL_TO_TEST });
  await waitFor("document.readyState === 'complete' && !!window.RECEIPTS_APP", 15000);

  const visible = id => `!document.getElementById('${id}').hidden`;

  // 1. First run starts on Personalize
  check("fresh browser opens on Personalize", await evaluate(visible("screen-personalize")));
  check("Chart.js loaded", await evaluate("typeof Chart === 'function'"));

  // 2. Finish setup -> Connect screen
  await evaluate("document.getElementById('finish-setup-btn').click()");
  check("setup leads to Connect your wearable", await evaluate(visible("screen-connect")));
  check("privacy note is shown", await evaluate("document.querySelector('.privacy-note').innerText.includes('stays on this device')"));
  await evaluate("document.getElementById('whoop-connect-btn').click()");
  await shot("connect");
  check("WHOOP 'coming soon' explains the API next step", await evaluate("!document.getElementById('whoop-soon').hidden && /developer API/.test(document.getElementById('whoop-soon').innerText)"));

  // 3. Demo path
  await evaluate("document.getElementById('use-demo-btn').click()");
  check("demo goes to the Log screen", await evaluate(visible("screen-tap")));
  check("header says demo data", await evaluate("document.getElementById('data-chip-label').innerText"), "Maya (demo data)");
  check("tap buttons rendered", (await evaluate("document.querySelectorAll('#tap-buttons .tap-btn').length")) >= 6);

  for (const screen of ["screen-timeline", "screen-detective", "screen-today", "screen-brief"]) {
    await evaluate(`document.querySelector('[data-screen="${screen}"]').click()`);
    await sleep(300);
    check(`${screen} opens`, await evaluate(visible(screen)));
  }
  check("timeline chart drew", await evaluate("!!Chart.getChart('timeline-chart')"));
  check("detective shows findings", (await evaluate("document.querySelectorAll('#findings-list .finding').length")) >= 2);
  check("brief has the disclaimer", await evaluate("document.getElementById('brief-page').innerText.includes('not a diagnosis')"));

  // Watch view: tap on the wrist -> appears on the timeline
  await evaluate("document.querySelector('[data-screen=\"screen-tap\"]').click()");
  await evaluate("document.getElementById('open-watch-btn').click()");
  check("watch view opens", await evaluate(visible("screen-watch")));
  const before = await evaluate("RECEIPTS_DATASOURCE.get().symptomTaps.length");
  await evaluate("document.querySelector('#watch-face-grid .watch-btn').click()");
  check("watch shows a calm confirmation", await evaluate("!document.getElementById('watch-face-done').hidden"),
        await evaluate("document.getElementById('watch-face-done-text').innerText"));
  await shot("watch-logged");
  // Layout checks on a phone-width (390px) window
  await evaluate("document.getElementById('watch-face-done').hidden = true");
  const layout = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('#watch-face-grid .watch-btn')].map(b => b.getBoundingClientRect());
    const face = document.getElementById('watch-face').getBoundingClientRect();
    return {
      pageWidth: document.documentElement.scrollWidth, viewport: window.innerWidth,
      minBtnH: Math.min(...btns.map(r => r.height)), minBtnW: Math.min(...btns.map(r => r.width)),
      insideFace: btns.slice(0, 4).every(r => r.left >= face.left && r.right <= face.right)
    };
  })()`);
  check("no sideways scrolling on a phone", layout.pageWidth <= layout.viewport, `${layout.pageWidth}px page in ${layout.viewport}px window`);
  check("watch buttons are big enough to tap (44px+)", layout.minBtnH >= 44 && layout.minBtnW >= 44, `${Math.round(layout.minBtnW)}x${Math.round(layout.minBtnH)}`);
  check("watch buttons sit inside the watch face", layout.insideFace);
  check("watch tap was recorded", (await evaluate("RECEIPTS_DATASOURCE.get().symptomTaps.length")) === before + 1);
  await evaluate("document.getElementById('watch-to-timeline-btn').click()");
  await sleep(300);
  check("timeline shows the just-logged tap", await evaluate(
    "Chart.getChart('timeline-chart').data.datasets.some(d => /just logged/.test(d.label))"));
  await shot("timeline-after-watch-tap");

  // 4. Optional: upload a real file through the actual file input
  if (UPLOAD) {
    await evaluate("document.getElementById('data-chip').click()");
    const { root } = await send("DOM.getDocument");
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "#upload-input" });
    const t0 = Date.now();
    await send("DOM.setFileInputFiles", { nodeId, files: [UPLOAD] });
    const done = await waitFor("!!document.getElementById('goto-timeline-btn') || document.getElementById('upload-status').classList.contains('error')", 180000);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const status = await evaluate("document.getElementById('upload-status').innerText");
    check(`upload of ${path.basename(UPLOAD)} finished in the browser (${secs}s)`, done && !(await evaluate("document.getElementById('upload-status').classList.contains('error')")), status);
    // Privacy-safe: report only what's available, never values.
    console.log("   result:", (await evaluate("document.querySelector('.result-box') ? document.querySelector('.result-box').innerText.replace(/\\d{4}-\\d{2}-\\d{2}/g,'<date>') : ''")).replace(/\n+/g, " | "));
    await evaluate("document.querySelector('[data-screen=\"screen-timeline\"]').click()");
    await sleep(400);
    check("timeline redrew on uploaded data", await evaluate("!!Chart.getChart('timeline-chart')"));
    check("timeline says what's missing", await evaluate("document.getElementById('timeline-missing').innerText.length > 0"));
    await evaluate("document.querySelector('[data-screen=\"screen-detective\"]').click()");
    check("detective explains unavailable insights", await evaluate("!!document.querySelector('.missing-box')"));
    await evaluate("document.querySelector('[data-screen=\"screen-today\"]').click()");
    check("today card renders", await evaluate("document.getElementById('today-content').innerText.length > 20"));
  }

  check("no JavaScript errors on the page", errors.length === 0, errors.join(" || ") || "none");
  ws.close(); chrome.kill();
  await new Promise(r => { chrome.once("exit", r); setTimeout(r, 3000); });
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* temp folder; OS cleans it */ }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.message); chrome.kill(); process.exit(2); });
