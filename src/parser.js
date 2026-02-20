/**
 * Fault-Tolerant JSON Parser — Recursive Descent
 *
 * Philosophy: Walk the input character by character.
 * When an error is encountered, recover AT THAT POSITION —
 * never skip large chunks of valid data.
 *
 * Recovery strategies per context:
 *   - Unexpected char in object key position → skip char, try again
 *   - Unclosed string → close at next structural char or EOF
 *   - Nested unescaped quotes → detect via lookahead heuristic
 *   - Truncated input → auto-complete current structure
 *   - Stray commas/colons → skip
 *   - Python booleans (True/False) → convert
 */

const DEFAULT_OPTIONS = {
  strict: false,
  maxDepth: 100,
  allowComments: true,
  allowTrailingComma: true,
  convertPythonTokens: true,
  convertUndefined: true,
};

class FaultTolerantParser {
  constructor(input, options = {}) {
    this.input = input;
    this.pos = 0;
    this.errors = [];
    this._depth = 0;
    this._nestDepth = 0;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  ch() {
    return this.pos < this.input.length ? this.input[this.pos] : "";
  }

  eof() {
    return this.pos >= this.input.length;
  }

  error(msg) {
    this.errors.push({ pos: this.pos, message: msg });
    if (this.options.strict) {
      throw new SyntaxError(`[pos ${this.pos}] ${msg}`);
    }
  }

  skipWS() {
    while (this.pos < this.input.length) {
      const c = this.input[this.pos];
      if (/\s/.test(c)) { this.pos++; continue; }
      // Skip comments if enabled
      if (this.options.allowComments) {
        if (c === '/' && this.input[this.pos + 1] === '/') {
          this.pos += 2;
          while (this.pos < this.input.length && this.input[this.pos] !== '\n') this.pos++;
          continue;
        }
        if (c === '/' && this.input[this.pos + 1] === '*') {
          this.pos += 2;
          while (this.pos < this.input.length && !(this.input[this.pos] === '*' && this.input[this.pos + 1] === '/')) this.pos++;
          this.pos += 2;
          continue;
        }
      }
      break;
    }
  }

  matchWord(word) {
    return this.input.startsWith(word, this.pos);
  }

  // ── Core Parsers ──────────────────────────────────────────

  parseValue() {
    this.skipWS();
    if (this.eof()) return null;

    const c = this.ch();

    if (c === "{") return this.parseObject();
    if (c === "[") return this.parseArray();
    if (c === '"' || c === "'") return this.parseString();
    if (c === "-" || (c >= "0" && c <= "9")) return this.parseNumber();
    if (this.matchWord("true")) { this.pos += 4; return true; }
    if (this.matchWord("false")) { this.pos += 5; return false; }
    if (this.matchWord("null")) { this.pos += 4; return null; }
    if (this.options.convertPythonTokens) {
      if (this.matchWord("True")) { this.pos += 4; this.error("Python True → true"); return true; }
      if (this.matchWord("False")) { this.pos += 5; this.error("Python False → false"); return false; }
      if (this.matchWord("None")) { this.pos += 4; this.error("Python None → null"); return null; }
    }
    if (this.options.convertUndefined) {
      if (this.matchWord("undefined")) { this.pos += 9; this.error("undefined → null"); return null; }
    }
    if (this.matchWord("NaN")) { this.pos += 3; this.error("NaN → null"); return null; }
    if (this.matchWord("Infinity")) { this.pos += 8; this.error("Infinity → null"); return null; }

    // Container-closing chars: do NOT consume or recurse.
    // These belong to the parent parseObject/parseArray context.
    if (c === "}" || c === "]") {
      return undefined;
    }

    // Stray comma or colon — skip it and retry (with tight limit)
    if (c === "," || c === ":") {
      this.error(`Stray '${c}' at pos ${this.pos}, skipping`);
      this.pos++;
      this._depth++;
      if (this._depth > 10) { this._depth = 0; return null; }
      const r = this.parseValue();
      this._depth = 0;
      return r;
    }

    // Unknown char — skip and retry
    this.error(`Unexpected char '${c}' at pos ${this.pos}, skipping`);
    this.pos++;
    this._depth++;
    if (this._depth > 10) { this._depth = 0; return null; }
    const result = this.parseValue();
    this._depth = 0;
    return result;

  }

  /**
   * Parse a JSON object: { "key": value, ... }
   */
  parseObject() {
    this._nestDepth++;
    if (this._nestDepth > this.options.maxDepth) {
      this.error(`Max depth ${this.options.maxDepth} exceeded`);
      this._nestDepth--;
      // Skip to matching close or EOF
      let bal = 1; this.pos++;
      while (!this.eof() && bal > 0) {
        if (this.ch() === '{') bal++;
        else if (this.ch() === '}') bal--;
        this.pos++;
      }
      return null;
    }
    const obj = {};
    this.pos++;
    this.skipWS();

    while (!this.eof() && this.ch() !== "}") {
      this.skipWS();
      if (this.eof()) break;

      // Handle stray commas
      if (this.ch() === ",") {
        this.pos++;
        this.skipWS();
        continue;
      }

      if (this.ch() === "}") break;

      // Stray ']' inside object — skip
      if (this.ch() === "]") {
        this.error(`Unexpected ']' inside object at pos ${this.pos}, skipping`);
        this.pos++;
        continue;
      }

      // Parse key
      let key;
      if (this.ch() === '"' || this.ch() === "'") {
        key = this.parseString();
      } else if (/[a-zA-Z_$]/.test(this.ch())) {
        key = this.parseUnquotedIdentifier();
        this.error(`Unquoted key "${key}" at pos ${this.pos}`);
      } else {
        this.error(`Expected key, got '${this.ch()}' at pos ${this.pos}, skipping`);
        this.pos++;
        continue;
      }

      this.skipWS();

      if (typeof key === "string" && /^,+/.test(key)) {
        this.error(`Leading comma in key "${key}" at pos ${this.pos}`);
        key = key.replace(/^,+\s*/, "");
      }

      // Expect colon
      if (this.ch() === ":") {
        this.pos++;
      } else {
        this.error(`Expected ':' after key "${key}" at pos ${this.pos}`);
        // If we see a comma or closing brace, the key has no value
        if (this.ch() === "," || this.ch() === "}" || this.eof()) {
          obj[key] = null;
          continue;
        }
      }

      this.skipWS();

      // Truncated: no value after key
      if (this.eof()) {
        this.error(`Truncated value for key "${key}" at pos ${this.pos}`);
        obj[key] = null;
        break;
      }

      const value = this.parseValue();
      obj[key] = value !== undefined ? value : null;

      this.skipWS();

      // Expect comma or closing brace
      if (this.ch() === ",") {
        this.pos++;
      } else if (this.ch() === "}") {
        // fine
      } else if (this.eof()) {
        break;
      } else {
        // Missing comma
        this.error(`Expected ',' or '}' at pos ${this.pos}, continuing`);
      }
    }

    this._nestDepth--;
    if (this.ch() === "}") {
      this.pos++;
    } else {
      this.error(`Unclosed object, auto-closing at pos ${this.pos}`);
    }

    return obj;
  }

  /**
   * Parse a JSON array: [ value, ... ]
   */
  parseArray() {
    this._nestDepth++;
    if (this._nestDepth > this.options.maxDepth) {
      this.error(`Max depth ${this.options.maxDepth} exceeded`);
      this._nestDepth--;
      let bal = 1; this.pos++;
      while (!this.eof() && bal > 0) {
        if (this.ch() === '[') bal++;
        else if (this.ch() === ']') bal--;
        this.pos++;
      }
      return null;
    }
    const arr = [];
    this.pos++;
    this.skipWS();

    while (!this.eof() && this.ch() !== "]") {
      this.skipWS();
      if (this.eof()) break;

      if (this.ch() === ",") {
        this.pos++;
        this.skipWS();
        continue;
      }

      if (this.ch() === "]") break;

      if (this.ch() === "}") {
        this.error(`Unexpected '}' inside array at pos ${this.pos}, skipping`);
        this.pos++;
        continue;
      }

      // Heuristic: looks like an object key inside array (e.g. "fps": 30)
      // This likely means the array should have ended earlier.
      if (this._looksLikeKeyValueAhead()) {
        this.error(`Detected object key inside array at pos ${this.pos}, closing array`);
        break;
      }

      const value = this.parseValue();
      if (value !== undefined) {
        arr.push(value);
      }

      this.skipWS();

      if (this.ch() === ",") {
        this.pos++;
      } else if (this.ch() === "]") {
        // fine
      } else if (this.eof()) {
        break;
      } else {
        this.error(`Expected ',' or ']' at pos ${this.pos}, continuing`);
      }
    }

    this._nestDepth--;
    if (this.ch() === "]") {
      this.pos++;
    } else {
      this.error(`Unclosed array, auto-closing at pos ${this.pos}`);
    }

    return arr;
  }

  /**
   * Parse a string with resilient handling of:
   *   - Unescaped embedded quotes (lookahead heuristic)
   *   - Truncated strings
   *   - Invalid escape sequences
   */
  parseString() {
    const quote = this.ch();
    this.pos++;
    let str = "";

    while (!this.eof()) {
      const c = this.ch();

      // Escape sequence
      if (c === "\\") {
        this.pos++;
        if (this.eof()) {
          this.error(`Truncated escape at end of input`);
          break;
        }
        const esc = this.ch();
        this.pos++;
        switch (esc) {
          case '"': str += '"'; break;
          case "'": str += "'"; break;
          case "\\": str += "\\"; break;
          case "/": str += "/"; break;
          case "b": str += "\b"; break;
          case "f": str += "\f"; break;
          case "n": str += "\n"; break;
          case "r": str += "\r"; break;
          case "t": str += "\t"; break;
          case "u": {
            let hex = "";
            for (let j = 0; j < 4 && !this.eof(); j++) {
              if (/[0-9a-fA-F]/.test(this.ch())) {
                hex += this.ch();
                this.pos++;
              } else break;
            }
            if (hex.length === 4) {
              str += String.fromCharCode(parseInt(hex, 16));
            } else {
              this.error(`Invalid \\u${hex} at pos ${this.pos}`);
              str += "\\u" + hex;
            }
            break;
          }
          default:
            this.error(`Invalid escape \\${esc} at pos ${this.pos - 1}`);
            str += esc;
        }
        continue;
      }

      // Possible closing quote — use lookahead to decide
      if (c === quote) {
        // Look ahead: if the next non-ws char is structural, this is the real end
        let la = this.pos + 1;
        while (la < this.input.length && /\s/.test(this.input[la])) la++;
        const next = this.input[la] || "";

        if (next === "" || next === "," || next === ":" || next === "}" ||
          next === "]" || next === "{" || next === "[") {
          this.pos++;
          return str;
        } else {
          // Embedded unescaped quote — treat as literal
          this.error(`Unescaped quote in string at pos ${this.pos}`);
          str += c;
          this.pos++;
          continue;
        }
      }

      // Newlines in strings
      if (c === "\n" || c === "\r") {
        this.error(`Newline in string at pos ${this.pos}, closing string`);
        return str;
      }

      str += c;
      this.pos++;
    }

    this.error(`Unterminated string at pos ${this.pos}`);
    return str;
  }

  parseNumber() {
    const start = this.pos;
    if (this.ch() === "-") this.pos++;
    if (this.ch() === "0") {
      this.pos++;
    } else {
      while (!this.eof() && this.ch() >= "0" && this.ch() <= "9") this.pos++;
    }
    if (this.ch() === ".") {
      this.pos++;
      while (!this.eof() && this.ch() >= "0" && this.ch() <= "9") this.pos++;
    }
    if (this.ch() === "e" || this.ch() === "E") {
      this.pos++;
      if (this.ch() === "+" || this.ch() === "-") this.pos++;
      while (!this.eof() && this.ch() >= "0" && this.ch() <= "9") this.pos++;
    }
    const num = Number(this.input.slice(start, this.pos));
    if (isNaN(num)) {
      this.error(`Invalid number at pos ${start}`);
      return 0;
    }
    return num;
  }

  parseUnquotedIdentifier() {
    const start = this.pos;
    while (!this.eof() && /[\w$]/.test(this.ch())) this.pos++;
    return this.input.slice(start, this.pos);
  }

  _looksLikeKeyValueAhead() {
    const start = this.pos;
    const c = this.ch();

    // Quoted key
    if (c === '"' || c === "'") {
      let i = start + 1;
      while (i < this.input.length) {
        const ch = this.input[i];
        if (ch === "\\") { i += 2; continue; }
        if (ch === c) { i++; break; }
        if (ch === "\n" || ch === "\r") return false;
        i++;
      }
      if (i >= this.input.length) return false;
      while (i < this.input.length && /\s/.test(this.input[i])) i++;
      return this.input[i] === ":";
    }

    // Unquoted key
    if (/[a-zA-Z_$]/.test(c)) {
      let i = start;
      while (i < this.input.length && /[\w$]/.test(this.input[i])) i++;
      while (i < this.input.length && /\s/.test(this.input[i])) i++;
      return this.input[i] === ":";
    }

    return false;
  }

  parse() {
    if (this.input.charCodeAt(0) === 0xfeff) this.pos = 1;
    this.skipWS();
    if (this.eof()) return { ok: true, result: null, errors: [] };
    const result = this.parseValue();
    return { ok: this.errors.length === 0, result, errors: this.errors };
  }
}

function parseSmart(input, options = {}) {
  if (!input || !input.trim()) {
    return { ok: true, results: [], errorCount: 0, errors: [], multiple: false };
  }
  try {
    const parser = new FaultTolerantParser(input, options);
    const { ok, result, errors } = parser.parse();
    return {
      ok,
      results: result !== null && result !== undefined ? [result] : [],
      errorCount: errors.length,
      errors: errors.map((e) => `[pos ${e.pos}] ${e.message}`),
      multiple: false
    };
  } catch (err) {
    // Strict mode throws on first error
    return {
      ok: false,
      results: [],
      errorCount: 1,
      errors: [err.message],
      multiple: false
    };
  }
}

module.exports = { parseSmart, FaultTolerantParser, DEFAULT_OPTIONS };
