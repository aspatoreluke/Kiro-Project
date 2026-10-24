#!/usr/bin/env node
/* A tiny MCP client. It starts the official "fetch" MCP server (the same one
   configured for Kiro in .kiro/settings/mcp.json), speaks the Model Context
   Protocol to it over stdin/stdout, and asks it to fetch a web page as text.

   We used this to read WHOOP and Apple Health export documentation while
   checking the adapters.

   Usage: node tools/mcp-fetch.js <url> [maxChars]
*/
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const url = process.argv[2];
const maxLength = Number(process.argv[3] || 6000);
if (!url) { console.error("Usage: node tools/mcp-fetch.js <url> [maxChars]"); process.exit(1); }

// Use the same command + args Kiro uses, straight from the workspace MCP config.
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "../.kiro/settings/mcp.json"), "utf8"));
const server = cfg.mcpServers.fetch;
const child = spawn(server.command, server.args, {
  env: { ...process.env, ...(server.env || {}) },
  stdio: ["pipe", "pipe", "inherit"]
});
child.on("error", e => { console.error(`[mcp] couldn't start "${server.command}": ${e.message}. Is uv installed?`); process.exit(2); });

let buf = "", nextId = 1;
const waiting = new Map();
child.stdout.on("data", d => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  }
});
function rpc(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise(resolve => waiting.set(id, resolve));
}
const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

(async () => {
  const timer = setTimeout(() => { console.error("MCP server timed out"); child.kill(); process.exit(2); }, 90000);
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "receipts-mcp-check", version: "1.0" }
  });
  console.error(`[mcp] connected to ${init.result.serverInfo.name} ${init.result.serverInfo.version}`);
  notify("notifications/initialized", {});
  const tools = await rpc("tools/list", {});
  console.error(`[mcp] tools: ${tools.result.tools.map(t => t.name).join(", ")}`);
  // RAW=1 returns the page as-is (useful for JSON docs) instead of simplified text.
  const res = await rpc("tools/call", { name: "fetch", arguments: { url, max_length: maxLength, raw: process.env.RAW === "1" } });
  if (res.error) { console.error("[mcp] error:", res.error.message); process.exitCode = 1; }
  else process.stdout.write((res.result.content || []).map(c => c.text || "").join("\n") + "\n");
  clearTimeout(timer);
  child.kill();
})();
