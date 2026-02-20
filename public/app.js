// ── DOM refs ─────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const inputEl = $("input");
const outputEl = $("output");
const statusEl = $("status");
const notesEl = $("notes");
const statsPanel = $("statsPanel");
const statsGrid = $("statsGrid");
const queryInput = $("queryInput");
const indentSelect = $("indentSelect");
const optionsToggle = $("optionsToggle");
const optionsGrid = $("optionsGrid");

// Currently parsed result (for tools to operate on)
let currentResult = null;

// ── Theme ────────────────────────────────────────────────────
const themeBtn = $("themeToggle");
const savedTheme = localStorage.getItem("theme") || "light";
if (savedTheme === "dark") {
  document.documentElement.setAttribute("data-theme", "dark");
  themeBtn.textContent = "☀️";
}

themeBtn.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
  themeBtn.textContent = isDark ? "🌙" : "☀️";
  localStorage.setItem("theme", isDark ? "light" : "dark");
});

// ── Options toggle ───────────────────────────────────────────
optionsToggle.addEventListener("click", () => {
  optionsToggle.classList.toggle("collapsed");
  optionsGrid.classList.toggle("collapsed");
});

// ── Helpers ──────────────────────────────────────────────────
function setStatus(text) { statusEl.textContent = text; }

function getOptions() {
  return {
    strict: $("opt-strict").checked,
    maxDepth: parseInt($("opt-maxDepth").value, 10) || 100,
    allowComments: $("opt-allowComments").checked,
    allowTrailingComma: $("opt-allowTrailingComma").checked,
    convertPythonTokens: $("opt-convertPythonTokens").checked,
    convertUndefined: $("opt-convertUndefined").checked,
  };
}

function getIndent() {
  const v = indentSelect.value;
  return v === "tab" ? "\t" : parseInt(v, 10);
}

function renderOutput(obj) {
  outputEl.textContent = JSON.stringify(obj, null, getIndent());
}

function renderNotes(data) {
  notesEl.innerHTML = "";
  const add = (text, cls = "") => {
    const li = document.createElement("li");
    li.textContent = text;
    if (cls) li.className = cls;
    notesEl.appendChild(li);
  };

  if (data.ok && data.errorCount === 0) {
    add("✓ Parsed successfully — no errors", "success");
  } else if (data.ok) {
    add(`⚠ Parsed with ${data.errorCount} recovery point(s)`, "error");
  } else {
    add(`✗ Parse failed with ${data.errorCount} error(s)`, "error");
  }

  if (data.errors) {
    for (const err of data.errors) {
      add(err, "error");
    }
  }
}

// ── API calls ────────────────────────────────────────────────
async function apiCall(endpoint, body) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Parse ────────────────────────────────────────────────────
async function parse() {
  const raw = inputEl.value || "";
  if (!raw.trim()) { setStatus("Nothing to parse"); return; }

  setStatus("Parsing...");
  outputEl.textContent = "";
  notesEl.innerHTML = "";
  statsPanel.style.display = "none";

  try {
    const data = await apiCall("/parse", { input: raw, options: getOptions() });
    currentResult = data.results && data.results.length > 0 ? data.results[0] : null;
    if (currentResult !== null) {
      renderOutput(currentResult);
    } else {
      outputEl.textContent = "(no result)";
    }
    renderNotes(data);
    setStatus("Done");
  } catch (err) {
    outputEl.textContent = String(err);
    setStatus("Failed");
  }
}

$("parseBtn").addEventListener("click", parse);

// ── Clear ────────────────────────────────────────────────────
$("clearBtn").addEventListener("click", () => {
  inputEl.value = "";
  outputEl.textContent = "";
  notesEl.innerHTML = "";
  statsPanel.style.display = "none";
  currentResult = null;
  setStatus("Cleared");
});

// ── Sample ───────────────────────────────────────────────────
const sample = `{
  "itag": 395,
  "bitrate": 207057,
  // this is a comment
  "width": 426,
  "height": 240,
  "mimeType": "video/mp4; codecs=\\"av01",
  "active": True,
  "formats": [
    { "itag": 395 },
    { "itag": 396 },
  ],
  itag2: 397,
  bitrate2: undefined,
  "truncated_key`;

$("sampleBtn").addEventListener("click", () => {
  inputEl.value = sample;
  setStatus("Sample loaded");
});

// ── Toolbar actions ──────────────────────────────────────────
document.querySelector(".toolbar").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  // Non-API actions
  if (action === "copy") {
    if (outputEl.textContent) {
      await navigator.clipboard.writeText(outputEl.textContent);
      setStatus("Copied!");
    }
    return;
  }

  if (action === "download") {
    if (!outputEl.textContent) return;
    const blob = new Blob([outputEl.textContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "output.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded!");
    return;
  }

  // Stats → special rendering
  if (action === "stats") {
    if (!currentResult) { setStatus("Parse first"); return; }
    setStatus("Getting stats...");
    const data = await apiCall("/stats", { json: currentResult });
    if (data.ok) {
      renderStats(data.result);
      setStatus("Stats ready");
    }
    return;
  }

  // All other utils: operate on currentResult
  if (!currentResult) { setStatus("Parse first"); return; }
  setStatus(`Running ${action}...`);

  const data = await apiCall(`/${action}`, { json: currentResult });
  if (data.ok) {
    // If the result is a string (prettify/minify), show it directly
    if (typeof data.result === "string") {
      outputEl.textContent = data.result;
    } else {
      currentResult = data.result;
      renderOutput(data.result);
    }
    setStatus(`${action} done`);
  } else {
    setStatus(`Error: ${data.error}`);
  }
});

// ── Stats rendering ──────────────────────────────────────────
function renderStats(s) {
  statsPanel.style.display = "block";
  statsGrid.innerHTML = "";
  const items = [
    ["Depth", s.depth],
    ["Keys", s.totalKeys],
    ["Values", s.totalValues],
    ["Size", formatBytes(s.sizeBytes)],
    ["Strings", s.types.string],
    ["Numbers", s.types.number],
    ["Booleans", s.types.boolean],
    ["Nulls", s.types.null],
    ["Objects", s.types.object],
    ["Arrays", s.types.array],
  ];

  for (const [label, value] of items) {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="stat-value">${value}</div><div class="stat-label">${label}</div>`;
    statsGrid.appendChild(card);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Query ────────────────────────────────────────────────────
$("queryBtn").addEventListener("click", async () => {
  const path = queryInput.value.trim();
  if (!path || !currentResult) { setStatus("Enter a path and parse first"); return; }

  setStatus("Querying...");
  const data = await apiCall("/query", { json: currentResult, path });
  if (data.ok) {
    const result = data.result;
    if (typeof result === "object" && result !== null) {
      outputEl.textContent = JSON.stringify(result, null, getIndent());
    } else {
      outputEl.textContent = String(result);
    }
    setStatus(`Query result for: ${path}`);
  } else {
    setStatus(`Query error: ${data.error}`);
  }
});

// Query on Enter
queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("queryBtn").click();
});

// Re-format on indent change
indentSelect.addEventListener("change", () => {
  if (currentResult) renderOutput(currentResult);
});

// Parse on Ctrl+Enter
inputEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") parse();
});
