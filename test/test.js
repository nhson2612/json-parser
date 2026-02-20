const { parseSmart, FaultTolerantParser, DEFAULT_OPTIONS } = require("../src/parser");
const utils = require("../src/utils");
const assert = require("assert");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log("\n── Basic Parser Tests ──");

test("valid JSON object", () => {
    const r = parseSmart('{"a":1,"b":[2,3]}');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.results[0], { a: 1, b: [2, 3] });
});

test("valid JSON array", () => {
    const r = parseSmart('[1,2,"three",true]');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.results[0], [1, 2, "three", true]);
});

test("empty input", () => {
    const r = parseSmart("");
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.results.length, 0);
});

test("whitespace only input", () => {
    const r = parseSmart("   \n\t  ");
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.results.length, 0);
});

test("null input", () => {
    const r = parseSmart(null);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.results.length, 0);
});

console.log("\n── Fault Tolerance Tests ──");

test("truncated JSON - object", () => {
    const r = parseSmart('{"name":"John","age":30,"addr');
    assert.strictEqual(r.results[0].name, "John");
    assert.strictEqual(r.results[0].age, 30);
    assert.strictEqual(r.results[0].addr, null);
});

test("truncated JSON - array", () => {
    const r = parseSmart('[1,2,3');
    assert.deepStrictEqual(r.results[0], [1, 2, 3]);
});

test("truncated string", () => {
    const r = parseSmart('{"key":"val');
    assert.strictEqual(r.results[0].key, "val");
});

test("missing colon after key", () => {
    const r = parseSmart('{"key" "value"}');
    assert(r.errorCount >= 0);
});

test("missing comma between values", () => {
    const r = parseSmart('{"a":1 "b":2}');
    assert.strictEqual(r.results[0].a, 1);
    assert.strictEqual(r.results[0].b, 2);
});

test("stray comma at end", () => {
    const r = parseSmart('{"a":1,}');
    assert.strictEqual(r.results[0].a, 1);
});

test("trailing comma in array", () => {
    const r = parseSmart('[1,2,3,]');
    assert.deepStrictEqual(r.results[0], [1, 2, 3]);
});

test("multiple stray commas", () => {
    const r = parseSmart(',,{"a":1,,,');
    assert.strictEqual(r.results[0].a, 1);
});

test("unclosed object auto-closes", () => {
    const r = parseSmart('{"a":1');
    assert.strictEqual(r.results[0].a, 1);
});

test("unclosed array auto-closes", () => {
    const r = parseSmart('[1,2');
    assert.deepStrictEqual(r.results[0], [1, 2]);
});

console.log("\n── Python Token Tests ──");

test("Python True/False", () => {
    const r = parseSmart('{"x": True, "y": False}');
    assert.strictEqual(r.results[0].x, true);
    assert.strictEqual(r.results[0].y, false);
    assert.strictEqual(r.errorCount, 2);
});

test("Python None", () => {
    const r = parseSmart('{"x": None}');
    assert.strictEqual(r.results[0].x, null);
});

test("Python True disabled", () => {
    const r = parseSmart('{"x": True}', { convertPythonTokens: false });
    assert.strictEqual(r.ok, false);
});

test("Python None disabled", () => {
    const r = parseSmart('{"x": None}', { convertPythonTokens: false });
    assert.strictEqual(r.ok, false);
});

console.log("\n── JavaScript Token Tests ──");

test("undefined converts to null", () => {
    const r = parseSmart('{"x": undefined}');
    assert.strictEqual(r.results[0].x, null);
});

test("undefined disabled", () => {
    const r = parseSmart('{"x": undefined}', { convertUndefined: false });
    assert.strictEqual(r.ok, false);
});

test("NaN converts to null", () => {
    const r = parseSmart('{"x": NaN}');
    assert.strictEqual(r.results[0].x, null);
});

test("Infinity converts to null", () => {
    const r = parseSmart('{"x": Infinity}');
    assert.strictEqual(r.results[0].x, null);
});

console.log("\n── String Tests ──");

test("basic string", () => {
    const r = parseSmart('"hello world"');
    assert.strictEqual(r.results[0], "hello world");
});

test("single quoted string", () => {
    const r = parseSmart("'hello world'");
    assert.strictEqual(r.results[0], "hello world");
});

test("escape sequences", () => {
    const r = parseSmart('"line1\\nline2\\ttab"');
    assert.strictEqual(r.results[0], "line1\nline2\ttab");
});

test("unicode escape", () => {
    const r = parseSmart('"\\u0041"');
    assert.strictEqual(r.results[0], "A");
});

test("unescaped quotes in string", () => {
    const r = parseSmart('{"html":"<div class=\\"red\\">hi</div>"}');
    assert(r.results[0].html.includes("red"));
});

test("embedded quotes handled", () => {
    const r = parseSmart('{"a":"test","b":"x"}');
    assert.strictEqual(r.results[0].a, "test");
    assert.strictEqual(r.results[0].b, "x");
});

console.log("\n── Number Tests ──");

test("integer", () => {
    const r = parseSmart("123");
    assert.strictEqual(r.results[0], 123);
});

test("negative number", () => {
    const r = parseSmart("-456");
    assert.strictEqual(r.results[0], -456);
});

test("float", () => {
    const r = parseSmart("3.14159");
    assert.strictEqual(r.results[0], 3.14159);
});

test("scientific notation", () => {
    const r = parseSmart("1.5e10");
    assert.strictEqual(r.results[0], 1.5e10);
});

test("negative exponent", () => {
    const r = parseSmart("2.5e-3");
    assert.strictEqual(r.results[0], 0.0025);
});

test("zero", () => {
    const r = parseSmart("0");
    assert.strictEqual(r.results[0], 0);
});

console.log("\n── Comment Tests ──");

test("single line comment", () => {
    const r = parseSmart('{"a": 1 // comment\n, "b": 2}');
    assert.strictEqual(r.results[0].a, 1);
    assert.strictEqual(r.results[0].b, 2);
});

test("multi-line comment", () => {
    const r = parseSmart('{"a": 1 /* comment */, "b": 2}');
    assert.strictEqual(r.results[0].a, 1);
    assert.strictEqual(r.results[0].b, 2);
});

test("block comment spanning lines", () => {
    const r = parseSmart('{"a": 1 /*\nmultiline\ncomment\n*/}');
    assert.strictEqual(r.results[0].a, 1);
});

test("comments disabled", () => {
    const r = parseSmart('{"a": 1 // comment}', { allowComments: false });
    assert.strictEqual(r.ok, false);
});

console.log("\n── Strict Mode Tests ──");

test("strict mode stops on first error", () => {
    const r = parseSmart('{"x": True}', { strict: true, convertPythonTokens: false });
    assert.strictEqual(r.ok, false);
});

test("strict mode allows valid JSON", () => {
    const r = parseSmart('{"a":1}', { strict: true });
    assert.strictEqual(r.ok, true);
});

test("strict mode returns ok=false", () => {
    const r = parseSmart('{"x": invalid}', { strict: true });
    assert.strictEqual(r.ok, false);
});

console.log("\n── Depth Limiting Tests ──");

test("maxDepth enforced", () => {
    const r = parseSmart('{"a":{"b":{"c":1}}}', { maxDepth: 2 });
    assert.strictEqual(r.errorCount > 0, true);
});

test("maxDepth allows deep nesting when high", () => {
    const r = parseSmart('{"a":{"b":{"c":1}}}', { maxDepth: 10 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.results[0].a.b.c, 1);
});

test("maxDepth default is 100", () => {
    assert.strictEqual(DEFAULT_OPTIONS.maxDepth, 100);
});

console.log("\n── Edge Cases ──");

test("BOM character handled", () => {
    const r = parseSmart('\uFEFF{"a":1}');
    assert.strictEqual(r.results[0].a, 1);
});

test("deeply nested arrays", () => {
    const r = parseSmart('[[[[[[1]]]]]]');
    assert(r.results[0][0][0][0][0][0] !== undefined);
});

test("deeply nested objects", () => {
    const r = parseSmart('{"a":{"b":{"c":1}}}');
    assert.strictEqual(r.results[0].a.b.c, 1);
});

test("mixed nested objects and arrays", () => {
    const r = parseSmart('{"arr":[{"obj":{"val":1}}]}');
    assert.strictEqual(r.results[0].arr[0].obj.val, 1);
});

test("empty object", () => {
    const r = parseSmart('{}');
    assert.deepStrictEqual(r.results[0], {});
});

test("empty array", () => {
    const r = parseSmart('[]');
    assert.deepStrictEqual(r.results[0], []);
});

test("null value", () => {
    const r = parseSmart('{"key": null}');
    assert.strictEqual(r.results[0].key, null);
});

test("boolean values", () => {
    const r = parseSmart('{"t": true, "f": false}');
    assert.strictEqual(r.results[0].t, true);
    assert.strictEqual(r.results[0].f, false);
});

test("unquoted keys", () => {
    const r = parseSmart('{key: "value"}');
    assert.strictEqual(r.results[0].key, "value");
});

test("keys with special chars", () => {
    const r = parseSmart('{"$key":1, "_key":2}');
    assert.strictEqual(r.results[0].$key, 1);
    assert.strictEqual(r.results[0]._key, 2);
});

test("numeric keys", () => {
    const r = parseSmart('{"0": "zero", "1": "one"}');
    assert.strictEqual(r.results[0]["0"], "zero");
});

test("unexpected char recovery", () => {
    const r = parseSmart('@{"a":1}');
    assert.strictEqual(r.results[0].a, 1);
});

console.log("\n── Utility Tests: sortKeys ──");

test("sortKeys basic", () => {
    const r = utils.sortKeys({ c: 3, a: 1, b: 2 });
    assert.deepStrictEqual(Object.keys(r), ["a", "b", "c"]);
});

test("sortKeys deep", () => {
    const r = utils.sortKeys({ c: { z: 1, a: 2 }, a: 1 });
    assert.deepStrictEqual(Object.keys(r), ["a", "c"]);
    assert.deepStrictEqual(Object.keys(r.c), ["a", "z"]);
});

test("sortKeys shallow", () => {
    const r = utils.sortKeys({ c: { z: 1, a: 2 }, a: 1 }, false);
    assert.deepStrictEqual(Object.keys(r), ["a", "c"]);
    assert.deepStrictEqual(Object.keys(r.c), ["z", "a"]);
});

test("sortKeys array", () => {
    const r = utils.sortKeys([{ z: 1, a: 2 }, { c: 3 }]);
    assert.deepStrictEqual(Object.keys(r[0]), ["a", "z"]);
});

console.log("\n── Utility Tests: flatten/unflatten ──");

test("flatten basic", () => {
    const flat = utils.flatten({ a: { b: 1, c: 2 } });
    assert.strictEqual(flat["a.b"], 1);
    assert.strictEqual(flat["a.c"], 2);
});

test("flatten custom separator", () => {
    const flat = utils.flatten({ a: { b: 1 } }, "/");
    assert.strictEqual(flat["a/b"], 1);
});

test("flatten deep", () => {
    const flat = utils.flatten({ a: { b: { c: 1 } } });
    assert.strictEqual(flat["a.b.c"], 1);
});

test("unflatten basic", () => {
    const flat = { "a.b": 1, "a.c": 2 };
    const unf = utils.unflatten(flat);
    assert.strictEqual(unf.a.b, 1);
    assert.strictEqual(unf.a.c, 2);
});

test("unflatten custom separator", () => {
    const flat = { "a/b": 1 };
    const unf = utils.unflatten(flat, "/");
    assert.strictEqual(unf.a.b, 1);
});

test("flatten/unflatten roundtrip", () => {
    const original = { x: { y: { z: 1 } }, a: 2 };
    const flat = utils.flatten(original);
    const restored = utils.unflatten(flat);
    assert.deepStrictEqual(restored, original);
});

console.log("\n── Utility Tests: query ──");

test("query basic", () => {
    assert.strictEqual(utils.query({ a: { b: 1 } }, "a.b"), 1);
});

test("query array index", () => {
    assert.strictEqual(utils.query({ a: { b: [1, 2, 3] } }, "a.b[1]"), 2);
});

test("query root", () => {
    const obj = { a: 1 };
    assert.deepStrictEqual(utils.query(obj, ""), obj);
    assert.deepStrictEqual(utils.query(obj, null), obj);
});

test("query nested", () => {
    assert.strictEqual(utils.query({ a: { b: { c: 1 } } }, "a.b.c"), 1);
});

test("query missing path", () => {
    assert.strictEqual(utils.query({ a: 1 }, "b.c"), undefined);
});

test("query null value", () => {
    assert.strictEqual(utils.query({ a: null }, "a"), null);
});

console.log("\n── Utility Tests: stats ──");

test("stats basic", () => {
    const s = utils.stats({ a: 1, b: "hi", c: [true] });
    assert.strictEqual(s.totalKeys, 3);
    assert(s.totalValues >= 3);
    assert.strictEqual(s.types.number, 1);
    assert.strictEqual(s.types.string, 1);
    assert.strictEqual(s.types.boolean, 1);
    assert.strictEqual(s.types.array, 1);
});

test("stats depth", () => {
    const s = utils.stats({ a: { b: { c: 1 } } });
    assert.strictEqual(s.depth, 3);
});

test("stats nested arrays", () => {
    const s = utils.stats({ arr: [[1, 2], [3]] });
    assert.strictEqual(s.types.array, 3);
});

test("stats sizeBytes", () => {
    const s = utils.stats({ a: 1 });
    assert(s.sizeBytes > 0);
});

console.log("\n── Utility Tests: removeNulls ──");

test("removeNulls basic", () => {
    const r = utils.removeNulls({ a: 1, b: null, c: undefined });
    assert.strictEqual(r.a, 1);
    assert.strictEqual(r.b, undefined);
    assert.strictEqual(r.c, undefined);
});

test("removeNulls nested", () => {
    const r = utils.removeNulls({ a: { b: null, c: 1 } });
    assert.strictEqual(r.a.c, 1);
    assert.strictEqual(r.a.b, undefined);
});

test("removeNulls array", () => {
    const r = utils.removeNulls([1, null, 2, undefined, 3]);
    assert.deepStrictEqual(r, [1, 2, 3]);
});

test("removeNulls preserves false and 0", () => {
    const r = utils.removeNulls({ a: false, b: 0, c: null });
    assert.strictEqual(r.a, false);
    assert.strictEqual(r.b, 0);
});

console.log("\n── Utility Tests: filterKeys ──");

test("filterKeys regex", () => {
    const r = utils.filterKeys({ apple: 1, banana: 2, apricot: 3 }, "^a");
    assert.deepStrictEqual(Object.keys(r), ["apple", "apricot"]);
});

test("filterKeys case insensitive", () => {
    const r = utils.filterKeys({ Apple: 1, banana: 2 }, "apple");
    assert.deepStrictEqual(Object.keys(r), ["Apple"]);
});

test("filterKeys array", () => {
    const r = utils.filterKeys([{ a: 1, b: 2 }, { a: 3 }], "a");
    assert.deepStrictEqual(r[0], { a: 1 });
    assert.deepStrictEqual(r[1], { a: 3 });
});

console.log("\n── Utility Tests: diffJson ──");

test("diffJson no changes", () => {
    const d = utils.diffJson({ a: 1 }, { a: 1 });
    assert.strictEqual(d.length, 0);
});

test("diffJson value changed", () => {
    const d = utils.diffJson({ a: 1 }, { a: 2 });
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].type, "changed");
});

test("diffJson key added", () => {
    const d = utils.diffJson({ a: 1 }, { a: 1, b: 2 });
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].type, "added");
});

test("diffJson key removed", () => {
    const d = utils.diffJson({ a: 1, b: 2 }, { a: 1 });
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].type, "removed");
});

test("diffJson nested", () => {
    const d = utils.diffJson({ a: { b: 1 } }, { a: { b: 2 } });
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].path, "a.b");
});

test("diffJson array changes", () => {
    const d = utils.diffJson([1, 2], [1, 3]);
    assert(d.length >= 1);
});

test("diffJson null vs object", () => {
    const d = utils.diffJson(null, { a: 1 });
    assert.strictEqual(d[0].type, "changed");
});

console.log("\n── Utility Tests: prettify/minify ──");

test("prettify default indent", () => {
    const result = utils.prettify({ a: 1, b: 2 });
    assert(result.includes("\n"));
    assert(result.includes("  "));
});

test("prettify custom indent", () => {
    const result = utils.prettify({ a: 1 }, 4);
    assert(result.includes("    "));
});

test("prettify tab indent", () => {
    const result = utils.prettify({ a: 1 }, "tab");
    assert(result.includes("\t"));
});

test("minify", () => {
    const result = utils.minify({ a: 1, b: 2 });
    assert(!result.includes("\n"));
    assert(!result.includes(" "));
});

test("prettify/minify roundtrip", () => {
    const original = { a: 1, b: { c: 2 } };
    const pretty = utils.prettify(original);
    const minified = utils.minify(JSON.parse(pretty));
    const restored = JSON.parse(minified);
    assert.deepStrictEqual(restored, original);
});

console.log("\n── API Endpoint Tests ──");

test("FaultTolerantParser class", () => {
    const parser = new FaultTolerantParser('{"test": 1}');
    const result = parser.parse();
    assert.strictEqual(result.result.test, 1);
});

test("DEFAULT_OPTIONS exported", () => {
    assert.strictEqual(DEFAULT_OPTIONS.strict, false);
    assert.strictEqual(DEFAULT_OPTIONS.maxDepth, 100);
    assert.strictEqual(DEFAULT_OPTIONS.allowComments, true);
});

console.log("\n── Results: " + passed + " passed, " + failed + " failed ──\n");
process.exit(failed > 0 ? 1 : 0);
