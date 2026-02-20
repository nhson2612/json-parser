const path = require("path");
const express = require("express");
const { parseSmart, DEFAULT_OPTIONS } = require("./parser");
const utils = require("./utils");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.text({ type: "text/plain", limit: "10mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Health ───────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

// ── Get default options ──────────────────────────────────────
app.get("/options", (_req, res) => res.json(DEFAULT_OPTIONS));

// ── Parse ────────────────────────────────────────────────────
app.post("/parse", (req, res) => {
  let input, options;
  if (typeof req.body === "string") {
    input = req.body;
    options = {};
  } else {
    input = req.body.input || "";
    options = req.body.options || {};
  }
  const result = parseSmart(input, options);
  res.json(result);
});

// ── Utility endpoints ────────────────────────────────────────

app.post("/prettify", (req, res) => {
  try {
    const { json, indent } = req.body;
    const obj = typeof json === "string" ? parseSmart(json).results[0] : json;
    res.json({ ok: true, result: utils.prettify(obj, indent || 2) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post("/minify", (req, res) => {
  try {
    const { json } = req.body;
    const obj = typeof json === "string" ? parseSmart(json).results[0] : json;
    res.json({ ok: true, result: utils.minify(obj) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post("/sort-keys", (req, res) => {
  try {
    const { json, deep } = req.body;
    const obj = typeof json === "string" ? parseSmart(json).results[0] : json;
    res.json({ ok: true, result: utils.sortKeys(obj, deep !== false) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post("/flatten", (req, res) => {
  try {
    const { json, separator } = req.body;
    const obj = typeof json === "string" ? parseSmart(json).results[0] : json;
    res.json({ ok: true, result: utils.flatten(obj, separator || ".") });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post("/unflatten", (req, res) => {
  try {
    const { json, separator } = req.body;
    const obj = typeof json === "string" ? parseSmart(json).results[0] : json;
    res.json({ ok: true, result: utils.unflatten(obj, separator || ".") });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post("/diff", (req, res) => {
  try {
    const { a, b } = req.body;
    const objA = typeof a === "string" ? parseSmart(a).results[0] : a;
    const objB = typeof b === "string" ? parseSmart(b).results[0] : b;
    res.json({ ok: true, result: utils.diffJson(objA, objB) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post("/query", (req, res) => {
  try {
    const { json, path: qpath } = req.body;
    const obj = typeof json === "string" ? parseSmart(json).results[0] : json;
    const result = utils.query(obj, qpath);
    res.json({ ok: true, result });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post("/stats", (req, res) => {
  try {
    const { json } = req.body;
    const obj = typeof json === "string" ? parseSmart(json).results[0] : json;
    res.json({ ok: true, result: utils.stats(obj) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post("/remove-nulls", (req, res) => {
  try {
    const { json } = req.body;
    const obj = typeof json === "string" ? parseSmart(json).results[0] : json;
    res.json({ ok: true, result: utils.removeNulls(obj) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post("/filter-keys", (req, res) => {
  try {
    const { json, pattern } = req.body;
    const obj = typeof json === "string" ? parseSmart(json).results[0] : json;
    res.json({ ok: true, result: utils.filterKeys(obj, pattern) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`json-parser listening on http://localhost:${PORT}`);
});
