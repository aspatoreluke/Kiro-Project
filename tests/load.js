/* Loads the browser scripts into Node so tests can call them.
   Each call gives a fresh copy (no state leaks between tests). */
const path = require("path");

const ORDER = [
  "js/data.js",
  "js/adapters/standard-model.js",
  "js/datasource.js",
  "js/symptoms.js",
  "js/safety.js",
  "js/analysis.js",
  "js/writer.js",
  "js/adapters/csv.js",
  "js/adapters/whoop.js",
  "js/adapters/apple-health.js"
];

function load() {
  const root = path.join(__dirname, "..");
  global.window = globalThis;
  // Minimal localStorage so symptoms.js doesn't complain.
  if (!globalThis.localStorage) {
    const store = {};
    globalThis.localStorage = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    };
  }
  ORDER.forEach(rel => {
    const full = path.join(root, rel);
    try { require.resolve(full); } catch (e) { return; } // adapter not written yet
    delete require.cache[require.resolve(full)];
    require(full);
  });
  return globalThis;
}

module.exports = { load };
