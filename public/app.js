// ── DOM refs ─────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const inputEl = $("input");
const outputEl = $("output");
const statusEl = $("status");
const notesEl = $("notes");
const inputHighlight = $("inputHighlight");
const statsGrid = $("statsGrid");
const queryInput = $("queryInput");
const querySuggestions = $("querySuggestions");
const suggestionList = $("suggestionList");
const indentSelect = $("indentSelect");
const charCount = $("charCount");
const settingsToggle = $("settingsToggle");
const settingsPanel = $("settingsPanel");
const settingsClose = $("settingsClose");

let currentResult = null;
let lastErrorPositions = null;
let allSuggestions = [];
let activeSuggestionIndex = -1;
let lastPrettyJson = "";
let parseTimer = null;

// ── Tabs ─────────────────────────────────────────────────────
const tabs = document.querySelectorAll(".tab");
const tabContents = {
  recovery: $("recovery-tab"),
  stats: $("stats-tab")
};

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    
    const target = tab.dataset.tab;
    Object.values(tabContents).forEach(c => c.style.display = "none");
    tabContents[target].style.display = "block";
  });
});

function showTab(name) {
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  if (tab) tab.click();
}

// ── Theme ────────────────────────────────────────────────────
const themeBtn = $("themeToggle");
const savedTheme = localStorage.getItem("theme") || "dark";
document.body.setAttribute("data-theme", savedTheme);

themeBtn.addEventListener("click", () => {
  const current = document.body.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});

// ── Helpers ──────────────────────────────────────────────────
function setStatus(text, type = "") {
  statusEl.textContent = text;
}

function getOptions() {
  return {
    strict: $("opt-strict")?.checked || false,
    maxDepth: parseInt($("opt-maxDepth")?.value || "100", 10) || 100,
    allowComments: $("opt-allowComments")?.checked ?? true,
    allowTrailingComma: $("opt-allowTrailingComma")?.checked ?? true,
    convertPythonTokens: $("opt-convertPythonTokens")?.checked ?? true,
    convertUndefined: $("opt-convertUndefined")?.checked ?? true,
  };
}

function getIndent() {
  const v = indentSelect.value;
  return v === "tab" ? "\t" : parseInt(v, 10);
}

// ── JSON Syntax Highlighter ──────────────────────────────────
function syntaxHighlight(json) {
  if (typeof json !== "string") {
    json = JSON.stringify(json, null, getIndent());
  }
  json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        cls = "json-boolean";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function indentStr(level) {
  const v = indentSelect.value;
  const unit = v === "tab" ? "\t" : " ".repeat(parseInt(v, 10));
  return unit.repeat(level);
}

function renderJsonHtml(value, depth = 0) {
  if (value === null) return `<span class="json-null">null</span>`;
  if (typeof value === "string") {
    return `<span class="json-string">"${escapeHtml(value)}"</span>`;
  }
  if (typeof value === "number") return `<span class="json-number">${value}</span>`;
  if (typeof value === "boolean") return `<span class="json-boolean">${value}</span>`;

  const isArray = Array.isArray(value);
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";
  const keys = isArray ? value.map((_, i) => i) : Object.keys(value);
  const count = keys.length;

  if (count === 0) return `${open}${close}`;

  const meta = isArray ? `${count} items` : `${count} keys`;
  let body = "";

  if (isArray) {
    const parts = value.map((v) => `${indentStr(depth + 1)}${renderJsonHtml(v, depth + 1)}`);
    body = `\n${parts.join(",\n")}\n${indentStr(depth)}`;
  } else {
    const parts = Object.keys(value).map((k) => {
      const key = `<span class="json-key">"${escapeHtml(k)}"</span>`;
      const val = renderJsonHtml(value[k], depth + 1);
      return `${indentStr(depth + 1)}${key}: ${val}`;
    });
    body = `\n${parts.join(",\n")}\n${indentStr(depth)}`;
  }

  return `<span class="fold" data-folded="false"><span class="fold-toggle">▾</span><span class="fold-expanded">${open}${body}${close}</span><span class="fold-collapsed">${open}…${close} <span class="fold-meta">(${meta})</span></span></span>`;
}

function renderOutput(obj, isQuery = false) {
  lastPrettyJson = JSON.stringify(obj, null, getIndent());
  outputEl.innerHTML = renderJsonHtml(obj);
  if (isQuery) {
    outputEl.style.border = "2px solid var(--accent)";
    outputEl.style.boxShadow = "0 0 15px var(--accent)";
    setTimeout(() => {
        outputEl.style.border = "none";
        outputEl.style.boxShadow = "none";
    }, 2000);
  }
}

function renderNotes(data) {
  notesEl.innerHTML = "";
  const add = (text, cls = "") => {
    const li = document.createElement("li");
    li.textContent = text;
    li.className = "log-item " + cls;
    notesEl.appendChild(li);
  };

  if (data.ok && data.errorCount === 0) {
    add("✓ Parsed successfully — no errors detected", "success");
  } else if (data.ok) {
    add(`⚠ Recovered with ${data.errorCount} fix(es)`, "error");
  } else {
    add(`✗ Parse failed — ${data.errorCount} error(s)`, "error");
  }

  if (data.errors) {
    for (const err of data.errors) {
      add(err, "error");
    }
  }
  showTab("recovery");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInputHighlight(text, positions) {
  if (!inputHighlight) return;
  const posSet = new Set(Array.isArray(positions) ? positions : []);
  let html = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const safe = ch === "\n" ? "\n" : escapeHtml(ch);
    if (posSet.has(i)) {
      html += `<span class="error-char">${safe || " "}</span>`;
    } else {
      html += safe;
    }
  }
  inputHighlight.innerHTML = html || " ";
}

function extractErrorPositions(errors) {
  if (!Array.isArray(errors)) return [];
  const positions = [];
  for (const err of errors) {
    const m = /\[pos (\d+)\]/.exec(err);
    if (m) positions.push(Number(m[1]));
  }
  return [...new Set(positions)].filter((p) => Number.isFinite(p) && p >= 0);
}

function buildPathSuggestions(obj, maxItems = 200, maxDepth = 5) {
  const paths = [];
  function walk(node, path, depth) {
    if (paths.length >= maxItems) return;
    if (depth > maxDepth) return;
    if (Array.isArray(node)) {
      paths.push(path || "(root)");
      const len = Math.min(node.length, 5);
      for (let i = 0; i < len; i++) {
        const p = `${path}[${i}]`;
        paths.push(p);
        walk(node[i], p, depth + 1);
      }
      return;
    }
    if (node !== null && typeof node === "object") {
      if (path) paths.push(path);
      for (const key of Object.keys(node)) {
        const p = path ? `${path}.${key}` : key;
        paths.push(p);
        walk(node[key], p, depth + 1);
        if (paths.length >= maxItems) return;
      }
    }
  }
  walk(obj, "", 0);
  return Array.from(new Set(paths.filter(Boolean)));
}

function renderSuggestions(list) {
  if (!suggestionList || !querySuggestions) return;
  if (document.activeElement !== queryInput) {
    querySuggestions.style.display = "none";
    return;
  }
  suggestionList.innerHTML = "";
  activeSuggestionIndex = -1;

  if (!list || list.length === 0) {
    querySuggestions.style.display = "none";
    return;
  }

  const frag = document.createDocumentFragment();
  for (const item of list.slice(0, 100)) {
    const li = document.createElement("li");
    li.className = "suggestion-item";
    li.textContent = item;
    li.addEventListener("click", () => {
      queryInput.value = item;
      querySuggestions.style.display = "none";
      queryInput.focus();
    });
    frag.appendChild(li);
  }
  suggestionList.appendChild(frag);
  querySuggestions.style.display = "block";
}

function filterSuggestions(query) {
  if (!query) return allSuggestions.slice(0, 100);
  const q = query.toLowerCase();
  return allSuggestions.filter((p) => p.toLowerCase().includes(q)).slice(0, 100);
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

  setStatus("⟳ Parsing...");
  outputEl.innerHTML = "";
  notesEl.innerHTML = "";

  try {
    const data = await apiCall("/parse", { input: raw, options: getOptions() });
    currentResult = data.results && data.results.length > 0 ? data.results[0] : null;
    if (currentResult !== null) {
      renderOutput(currentResult);
    } else {
outputEl.textContent = "(no result)";
    }
    renderNotes(data);
    lastErrorPositions = extractErrorPositions(data.errors);
    renderInputHighlight(raw, lastErrorPositions);
    allSuggestions = currentResult ? buildPathSuggestions(currentResult) : [];
    renderSuggestions(filterSuggestions(queryInput.value.trim()));

    if (data.ok && data.errorCount === 0) {
      setStatus("✓ Success");
    } else {
      setStatus(`⚠ Recovered (${data.errorCount} fix)`);
    }
  } catch (err) {
    outputEl.textContent = String(err);
    setStatus("✗ Error");
  }
}

$("parseBtn").addEventListener("click", parse);

// ── Realtime parse (debounced) ───────────────────────────────
function scheduleParse() {
  if (parseTimer) clearTimeout(parseTimer);
  parseTimer = setTimeout(() => {
    parseTimer = null;
    parse();
  }, 250);
}

// ── Clear ────────────────────────────────────────────────────
$("clearBtn").addEventListener("click", () => {
  inputEl.value = "";
outputEl.innerHTML = "// Output will appear here after parsing.";
  notesEl.innerHTML = '<li class="log-item">Ready to parse.</li>';
  currentResult = null;
  lastErrorPositions = null;
  allSuggestions = [];
  charCount.textContent = "0 chars";
  renderSuggestions([]);
  renderInputHighlight("", []);
  setStatus("Ready");
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
  charCount.textContent = sample.length.toLocaleString() + " chars";
  lastErrorPositions = null;
  allSuggestions = [];
  renderSuggestions([]);
  renderInputHighlight(sample, []);
  setStatus("Sample loaded");
  scheduleParse();
});

// ── Toolbar actions ──────────────────────────────────────────
document.querySelector(".toolbar").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "copy") {
    const text = lastPrettyJson || outputEl.textContent;
    if (text && !text.startsWith("//")) {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = "✓";
      setTimeout(() => btn.textContent = "📋", 1500);
      setStatus("Copied to clipboard");
    }
    return;
  }

  if (action === "download") {
    const text = lastPrettyJson || outputEl.textContent;
    if (!text || text.startsWith("//")) return;
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "output.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded!");
    return;
  }

if (action === "stats") {
    if (!currentResult) { setStatus("Parse first"); return; }
    setStatus("Loading stats...");
    const data = await apiCall("/stats", { json: currentResult });
    if (data.ok) {
      renderStats(data.result);
      showTab("stats");
      setStatus("Stats ready");
    }
    return;
  }

  if (!currentResult) { setStatus("Parse first"); return; }
  setStatus(`Running ${action}...`);

  const data = await apiCall(`/${action}`, { json: currentResult });
  if (data.ok) {
    if (typeof data.result === "string") {
      outputEl.innerHTML = syntaxHighlight(data.result);
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
    card.style = "background: var(--surface); border: 1px solid var(--border); padding: 8px; text-align: center; border-radius: var(--radius-sm);";
    card.innerHTML = `<div style="font-size: 14px; font-weight: 700; color: var(--accent);">${value}</div><div style="font-size: 9px; color: var(--muted); text-transform: uppercase;">${label}</div>`;
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
  if (!path || !currentResult) { setStatus("Enter path and parse first"); return; }

  setStatus("Querying...");
  const data = await apiCall("/query", { json: currentResult, path });
  if (data.ok) {
    renderOutput(data.result, true);
    setStatus(`Result for: ${path}`);
  } else {
    setStatus(`Query error: ${data.error}`);
  }
});

queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const items = Array.from(document.querySelectorAll(".suggestion-item"));
    if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
      queryInput.value = items[activeSuggestionIndex].textContent || "";
      querySuggestions.style.display = "none";
      return;
    }
    $("queryBtn").click();
  }
});

queryInput.addEventListener("input", () => {
  renderSuggestions(filterSuggestions(queryInput.value.trim()));
});

queryInput.addEventListener("focus", () => {
  renderSuggestions(filterSuggestions(queryInput.value.trim()));
});

queryInput.addEventListener("blur", () => {
  setTimeout(() => { querySuggestions.style.display = "none"; }, 120);
});

// Indent change
indentSelect.addEventListener("change", () => {
  if (currentResult) renderOutput(currentResult);
});

// Sync scroll
inputEl.addEventListener("scroll", () => {
  inputHighlight.scrollTop = inputEl.scrollTop;
  inputHighlight.scrollLeft = inputEl.scrollLeft;
});

inputEl.addEventListener("input", () => {
  charCount.textContent = inputEl.value.length.toLocaleString() + " chars";
  renderInputHighlight(inputEl.value, []);
  scheduleParse();
});

if (settingsToggle && settingsPanel) {
  settingsToggle.addEventListener("click", () => {
    settingsPanel.style.display = settingsPanel.style.display === "none" ? "flex" : "none";
  });
}

if (settingsClose && settingsPanel) {
  settingsClose.addEventListener("click", () => {
    settingsPanel.style.display = "none";
  });
}

// ── Fold toggle in output ────────────────────────────────────
outputEl.addEventListener("click", (e) => {
  const toggle = e.target.closest(".fold-toggle, .fold-collapsed");
  if (!toggle) return;
  const fold = toggle.closest(".fold");
  if (!fold) return;
  const isFolded = fold.getAttribute("data-folded") === "true";
  fold.setAttribute("data-folded", isFolded ? "false" : "true");
});
