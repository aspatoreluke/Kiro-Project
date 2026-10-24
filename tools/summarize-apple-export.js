#!/usr/bin/env node
/* Runs the real Apple Health adapter on a local export.xml and prints
   ONLY a privacy-safe summary: which metrics exist, how many days, and
   how long it took. It never prints any actual readings.

   Usage: node tools/summarize-apple-export.js sample-data/apple_health_export/export.xml
*/
const fs = require("fs");
const { load } = require("../tests/load");

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error("Give the path to export.xml"); process.exit(1); }

const A = load().RECEIPTS_ADAPTER_APPLE;
const p = A.createParser();
const t0 = Date.now();
const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: 8 * 1024 * 1024 });
let bytes = 0;
const size = fs.statSync(file).size;

stream.on("data", chunk => { p.push(chunk); bytes += Buffer.byteLength(chunk); });
stream.on("end", () => {
  const ds = p.finish();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`File size: ${(size / 1e6).toFixed(0)} MB, read in ${secs}s`);
  console.log(`Records scanned: ${ds.stats.recordsSeen.toLocaleString()}, used: ${ds.stats.recordsUsed.toLocaleString()}`);
  console.log(`Days with any data (all time): ${ds.stats.daysTotal}`);
  console.log(`Days kept (most recent 90-day window): ${ds.daily.length}`);
  console.log("Metric available?");
  Object.entries(ds.availability).forEach(([k, v]) => {
    const days = ds.daily.filter(d => d[k] !== null).length;
    console.log(`  ${k.padEnd(15)} ${v ? "yes" : "no "}  (${days} days)`);
  });
  if (ds.notes.length) console.log("Notes:", ds.notes.join(" "));
});
