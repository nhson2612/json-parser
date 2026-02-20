/**
 * JSON utility functions — prettify, minify, sort, flatten, diff, query, stats
 */

// ── Pretty-print / Minify ────────────────────────────────────

function prettify(obj, indent = 2) {
    const sp = typeof indent === "number" ? indent : indent === "tab" ? "\t" : 2;
    return JSON.stringify(obj, null, sp);
}

function minify(obj) {
    return JSON.stringify(obj);
}

// ── Sort Keys ────────────────────────────────────────────────

function sortKeys(obj, deep = true) {
    if (Array.isArray(obj)) {
        return deep ? obj.map((v) => sortKeys(v, true)) : obj;
    }
    if (obj !== null && typeof obj === "object") {
        const sorted = {};
        for (const key of Object.keys(obj).sort()) {
            sorted[key] = deep ? sortKeys(obj[key], true) : obj[key];
        }
        return sorted;
    }
    return obj;
}

// ── Flatten / Unflatten ──────────────────────────────────────

function flatten(obj, sep = ".", prefix = "") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}${sep}${key}` : key;
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            Object.assign(result, flatten(value, sep, path));
        } else {
            result[path] = value;
        }
    }
    return result;
}

function unflatten(obj, sep = ".") {
    const result = {};
    for (const [fullKey, value] of Object.entries(obj)) {
        const parts = fullKey.split(sep);
        let cur = result;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in cur)) cur[parts[i]] = {};
            cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = value;
    }
    return result;
}

// ── Diff ─────────────────────────────────────────────────────

function diffJson(a, b, path = "") {
    const diffs = [];

    if (a === b) return diffs;
    if (a === null || b === null || typeof a !== typeof b) {
        diffs.push({ path: path || "(root)", type: "changed", from: a, to: b });
        return diffs;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        const maxLen = Math.max(a.length, b.length);
        for (let i = 0; i < maxLen; i++) {
            const p = `${path}[${i}]`;
            if (i >= a.length) diffs.push({ path: p, type: "added", value: b[i] });
            else if (i >= b.length) diffs.push({ path: p, type: "removed", value: a[i] });
            else diffs.push(...diffJson(a[i], b[i], p));
        }
        return diffs;
    }

    if (typeof a === "object") {
        const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of allKeys) {
            const p = path ? `${path}.${key}` : key;
            if (!(key in a)) diffs.push({ path: p, type: "added", value: b[key] });
            else if (!(key in b)) diffs.push({ path: p, type: "removed", value: a[key] });
            else diffs.push(...diffJson(a[key], b[key], p));
        }
        return diffs;
    }

    if (a !== b) {
        diffs.push({ path: path || "(root)", type: "changed", from: a, to: b });
    }
    return diffs;
}

// ── Query (simple dot-path with bracket notation) ────────────

function query(obj, path) {
    if (!path || !obj) return obj;
    // Parse path: "a.b[0].c" → ["a", "b", 0, "c"]
    const segments = [];
    const re = /([^.\[\]]+)|\[(\d+)\]/g;
    let m;
    while ((m = re.exec(path)) !== null) {
        segments.push(m[2] !== undefined ? Number(m[2]) : m[1]);
    }

    let cur = obj;
    for (const seg of segments) {
        if (cur === null || cur === undefined) return undefined;
        cur = cur[seg];
    }
    return cur;
}

// ── Stats ────────────────────────────────────────────────────

function stats(obj) {
    const result = {
        depth: 0,
        totalKeys: 0,
        totalValues: 0,
        types: { string: 0, number: 0, boolean: 0, null: 0, object: 0, array: 0 },
        sizeBytes: 0,
    };

    function walk(node, currentDepth) {
        if (currentDepth > result.depth) result.depth = currentDepth;

        if (node === null) { result.types.null++; result.totalValues++; return; }
        if (typeof node === "string") { result.types.string++; result.totalValues++; return; }
        if (typeof node === "number") { result.types.number++; result.totalValues++; return; }
        if (typeof node === "boolean") { result.types.boolean++; result.totalValues++; return; }

        if (Array.isArray(node)) {
            result.types.array++;
            for (const item of node) walk(item, currentDepth + 1);
            return;
        }

        if (typeof node === "object") {
            result.types.object++;
            const keys = Object.keys(node);
            result.totalKeys += keys.length;
            for (const key of keys) walk(node[key], currentDepth + 1);
        }
    }

    walk(obj, 0);
    result.sizeBytes = Buffer.byteLength(JSON.stringify(obj), "utf-8");
    return result;
}

// ── Remove Nulls ─────────────────────────────────────────────

function removeNulls(obj) {
    if (Array.isArray(obj)) {
        return obj.filter((v) => v !== null && v !== undefined).map(removeNulls);
    }
    if (obj !== null && typeof obj === "object") {
        const cleaned = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v !== null && v !== undefined) {
                cleaned[k] = removeNulls(v);
            }
        }
        return cleaned;
    }
    return obj;
}

// ── Filter Keys ──────────────────────────────────────────────

function filterKeys(obj, pattern, deep = true) {
    const re = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;

    if (Array.isArray(obj)) {
        return deep ? obj.map((v) => filterKeys(v, re, true)) : obj;
    }
    if (obj !== null && typeof obj === "object") {
        const filtered = {};
        for (const [k, v] of Object.entries(obj)) {
            if (re.test(k)) {
                filtered[k] = deep ? filterKeys(v, re, true) : v;
            }
        }
        return filtered;
    }
    return obj;
}

module.exports = {
    prettify,
    minify,
    sortKeys,
    flatten,
    unflatten,
    diffJson,
    query,
    stats,
    removeNulls,
    filterKeys,
};
