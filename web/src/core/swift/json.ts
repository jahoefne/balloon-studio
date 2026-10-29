// Ported from Foundation JSON writers used by mac/Sources/BalloonStudio @ cbda68d
// (JSONEncoder: CloudGeometry:464, FigureGeometry:570, ThreeMF:49, SegmentedRing:79;
// JSONSerialization: ThreeMF:48, SegmentedRing:79-83; docs/plan.md, Abschnitt 3).
// Measured with web/tests/fixtures/swift/probes/{json,keys,keys2}.swift.
//
// JSONEncoder (`.sortedKeys`, as the StableJSON patch of WP-V1 configures it):
//   compact; keys in code-point order (`"B" < "_x" < "a" < "a10" < "a9"`); doubles printed
//   as `description` minus a trailing `.0` (`230`, `-0`, `1e-05`, `1e+16`); `nil` optionals
//   omitted (→ `undefined` here). → encodeJSONCompact
// JSONSerialization (`.sortedKeys`, optionally `.prettyPrinted`):
//   doubles as C `%.17g` (`0.29999999999999999`), integers as integers, keys in an ICU
//   collation (numeric, case-insensitive, punctuation < digits < letters, lower case first),
//   pretty form `"k" : v` with two-space indentation, one array element per line and
//   `[\n\n<indent>]` for empty containers. → encodeJSONCompactSerialization, encodeJSONPretty17g
// Both escape `"` `\` `/` and U+0000–U+001F (`\b \t \n \f \r`, else `\u00xx`) and write
// everything else, DEL and U+2028 included, as raw UTF-8. Non-finite numbers throw, as in Swift.
import { printfG, swiftDescription } from './format';

/**
 * An integer with Swift `Int` / NSNumber-integer provenance. JSONSerialization prints it as an
 * integer (`450`), whereas a plain `number` is a `Double` (`%.17g`). parseJSONSerialization
 * produces it for every integer literal, as `JSONSerialization.jsonObject` does.
 */
export class SwiftInt {
  readonly value: number;
  constructor(value: number) {
    if (!Number.isInteger(value)) throw new RangeError(`SwiftInt needs an integer, got ${value}`);
    this.value = value + 0; // Int has no -0
  }
}

export type JSONValue = null | boolean | number | string | SwiftInt | readonly JSONValue[] | JSONObject;
export interface JSONObject {
  readonly [key: string]: JSONValue | undefined;
}

/** JSON string literal as both Foundation writers produce it. */
export function escapeJSONString(s: string): string {
  let out = '"';
  let run = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let escape: string | undefined;
    if (c === 0x22) escape = '\\"';
    else if (c === 0x5c) escape = '\\\\';
    else if (c === 0x2f) escape = '\\/';
    else if (c < 0x20) {
      if (c === 0x08) escape = '\\b';
      else if (c === 0x09) escape = '\\t';
      else if (c === 0x0a) escape = '\\n';
      else if (c === 0x0c) escape = '\\f';
      else if (c === 0x0d) escape = '\\r';
      else escape = '\\u00' + (c < 0x10 ? '0' : '') + c.toString(16);
    }
    if (escape !== undefined) {
      out += s.slice(run, i) + escape;
      run = i + 1;
    }
  }
  return out + s.slice(run) + '"';
}

function integerText(value: number): string {
  return String(value + 0);
}

function requireFinite(x: number): void {
  if (!Number.isFinite(x)) throw new RangeError(`Unable to encode ${x} as JSON (non-finite number)`);
}

/** A Double as JSONEncoder writes it: `description` without a trailing `.0`. */
export function jsonEncoderNumber(x: number): string {
  requireFinite(x);
  const d = swiftDescription(x);
  return d.endsWith('.0') ? d.slice(0, -2) : d;
}

/** A Double as JSONSerialization writes it: `%.17g`. */
export function jsonSerializationNumber(x: number): string {
  requireFinite(x);
  return printfG(x, 17);
}

/** JSONEncoder `.sortedKeys` order: Unicode code points. */
export function compareCodePoints(a: string, b: string): number {
  const n = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < n; i++) {
    const x = a.codePointAt(i) as number;
    const y = b.codePointAt(i) as number;
    if (x !== y) return x < y ? -1 : 1;
    if (x > 0xffff) i++;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

// MARK: JSONSerialization key collation

// CLDR root order of printable ASCII punctuation (probe keys2.swift), before digits and letters.
const PUNCTUATION = ' _-,;:!?.\'"()[]{}@*/\\&#%`^+<=>|~$';
const LETTER = 1000;
const DIGITS = 500;

interface CollationElement {
  /** Primary class/weight: punctuation rank, DIGITS, or LETTER + folded letter. */
  primary: number;
  /** Digit runs only: the run without leading zeros (numeric value as a string). */
  digits: string;
  /** Digit runs only: number of digits, leading zeros included. */
  length: number;
  /** 1 for an upper-case letter. */
  upper: number;
}

function collationElements(key: string): CollationElement[] {
  const elements: CollationElement[] = [];
  for (let i = 0; i < key.length; ) {
    const c = key.charCodeAt(i);
    if (c >= 0x30 && c <= 0x39) {
      let j = i;
      while (j < key.length && key.charCodeAt(j) >= 0x30 && key.charCodeAt(j) <= 0x39) j++;
      const run = key.slice(i, j);
      let zeros = 0;
      while (zeros < run.length - 1 && run.charCodeAt(zeros) === 0x30) zeros++;
      elements.push({ primary: DIGITS, digits: run.slice(zeros), length: run.length, upper: 0 });
      i = j;
      continue;
    }
    if (c >= 0x61 && c <= 0x7a) elements.push({ primary: LETTER + c - 0x61, digits: '', length: 0, upper: 0 });
    else if (c >= 0x41 && c <= 0x5a) elements.push({ primary: LETTER + c - 0x41, digits: '', length: 0, upper: 1 });
    else {
      const rank = PUNCTUATION.indexOf(key[i] as string);
      // SWIFT-DIFF: only printable ASCII keys are modelled; every key in the app is an ASCII identifier.
      if (rank < 0) throw new RangeError(`JSONSerialization key collation is only modelled for printable ASCII, got ${JSON.stringify(key)}`);
      elements.push({ primary: rank, digits: '', length: 0, upper: 0 });
    }
    i++;
  }
  return elements;
}

function compareNumericRuns(a: string, b: string): number {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * JSONSerialization `.sortedKeys` order (Darwin: locale collation with numeric, case-insensitive
 * and forced ordering). Levels, as measured: (1) primary — punctuation in CLDR order < digit
 * runs by numeric value < letters case-folded, a prefix first; (2) case — lower before upper at
 * the first difference; (3) digit runs with fewer leading zeros first; (4) code units.
 */
export function compareJSONSerializationKeys(a: string, b: string): number {
  if (a === b) return 0;
  const x = collationElements(a);
  const y = collationElements(b);
  const n = x.length < y.length ? x.length : y.length;
  for (let i = 0; i < n; i++) {
    const p = x[i] as CollationElement;
    const q = y[i] as CollationElement;
    if (p.primary !== q.primary) return p.primary < q.primary ? -1 : 1;
    if (p.primary === DIGITS) {
      const c = compareNumericRuns(p.digits, q.digits);
      if (c !== 0) return c;
    }
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const p = x[i] as CollationElement;
    const q = y[i] as CollationElement;
    if (p.upper !== q.upper) return p.upper < q.upper ? -1 : 1;
  }
  for (let i = 0; i < n; i++) {
    const p = x[i] as CollationElement;
    const q = y[i] as CollationElement;
    if (p.length !== q.length) return p.length < q.length ? -1 : 1;
  }
  return a < b ? -1 : 1;
}

// MARK: Writers

type NumberWriter = (x: number) => string;

function sortedEntries(object: JSONObject, compare: (a: string, b: string) => number): [string, JSONValue][] {
  const entries: [string, JSONValue][] = [];
  for (const key of Object.keys(object)) {
    const value = object[key];
    if (value !== undefined) entries.push([key, value]);
  }
  return entries.sort((p, q) => compare(p[0], q[0]));
}

function writeCompact(value: JSONValue, number: NumberWriter, compare: (a: string, b: string) => number): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return number(value);
  if (typeof value === 'string') return escapeJSONString(value);
  if (value instanceof SwiftInt) return integerText(value.value);
  if (Array.isArray(value)) {
    const items = value as readonly JSONValue[];
    let out = '[';
    for (let i = 0; i < items.length; i++) out += (i > 0 ? ',' : '') + writeCompact(items[i] as JSONValue, number, compare);
    return out + ']';
  }
  const entries = sortedEntries(value as JSONObject, compare);
  let out = '{';
  entries.forEach(([key, v], i) => {
    out += (i > 0 ? ',' : '') + escapeJSONString(key) + ':' + writeCompact(v, number, compare);
  });
  return out + '}';
}

function writePretty(value: JSONValue, depth: number, number: NumberWriter, compare: (a: string, b: string) => number): string {
  if (value === null || typeof value !== 'object' || value instanceof SwiftInt) return writeCompact(value, number, compare);
  const indent = '  '.repeat(depth);
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    const items = value as readonly JSONValue[];
    const lines = items.map((item) => inner + writePretty(item, depth + 1, number, compare));
    return '[\n' + lines.join(',\n') + '\n' + indent + ']';
  }
  const entries = sortedEntries(value as JSONObject, compare);
  const lines = entries.map(([key, v]) => inner + escapeJSONString(key) + ' : ' + writePretty(v, depth + 1, number, compare));
  return '{\n' + lines.join(',\n') + '\n' + indent + '}';
}

/** Swift `JSONEncoder` with `.sortedKeys`: compact, `description` numbers, code-point key order. */
export function encodeJSONCompact(value: JSONValue): string {
  return writeCompact(value, jsonEncoderNumber, compareCodePoints);
}

/** Swift `JSONSerialization.data(withJSONObject:options: .sortedKeys)` (ThreeMF:48 `balloon-settings.json`). */
export function encodeJSONCompactSerialization(value: JSONValue): string {
  return writeCompact(value, jsonSerializationNumber, compareJSONSerializationKeys);
}

/** Swift `JSONSerialization.data(withJSONObject:options: [.prettyPrinted, .sortedKeys])` (SegmentedRing:83 `kit-manifest.json`). */
export function encodeJSONPretty17g(value: JSONValue): string {
  return writePretty(value, 0, jsonSerializationNumber, compareJSONSerializationKeys);
}

// MARK: Parsing with number provenance

/**
 * Swift `JSONSerialization.jsonObject(with:)` for the JSON this app writes: integer literals
 * become SwiftInt (so `"-0"` turns into the integer 0), other numbers become Doubles. Strict
 * RFC 8259 grammar; throws on malformed input.
 */
export function parseJSONSerialization(text: string): JSONValue {
  const parser = new Parser(text);
  parser.whitespace();
  const value = parser.value();
  parser.whitespace();
  if (parser.position !== text.length) parser.fail('trailing characters');
  return value;
}

class Parser {
  position = 0;
  constructor(private readonly text: string) {}

  fail(reason: string): never {
    throw new SyntaxError(`Invalid JSON at ${this.position}: ${reason}`);
  }

  whitespace(): void {
    while (this.position < this.text.length) {
      const c = this.text.charCodeAt(this.position);
      if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return;
      this.position++;
    }
  }

  value(): JSONValue {
    const c = this.text[this.position];
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"') return this.string();
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return this.number();
    for (const [literal, v] of [['true', true], ['false', false], ['null', null]] as const) {
      if (this.text.startsWith(literal, this.position)) {
        this.position += literal.length;
        return v;
      }
    }
    return this.fail('unexpected character');
  }

  object(): JSONObject {
    const out: Record<string, JSONValue> = {};
    this.position++;
    this.whitespace();
    if (this.text[this.position] === '}') {
      this.position++;
      return out;
    }
    for (;;) {
      this.whitespace();
      if (this.text[this.position] !== '"') this.fail('expected a key');
      const key = this.string();
      this.whitespace();
      if (this.text[this.position] !== ':') this.fail('expected ":"');
      this.position++;
      this.whitespace();
      out[key] = this.value();
      this.whitespace();
      const c = this.text[this.position++];
      if (c === '}') return out;
      if (c !== ',') this.fail('expected "," or "}"');
    }
  }

  array(): JSONValue[] {
    const out: JSONValue[] = [];
    this.position++;
    this.whitespace();
    if (this.text[this.position] === ']') {
      this.position++;
      return out;
    }
    for (;;) {
      this.whitespace();
      out.push(this.value());
      this.whitespace();
      const c = this.text[this.position++];
      if (c === ']') return out;
      if (c !== ',') this.fail('expected "," or "]"');
    }
  }

  string(): string {
    const start = ++this.position;
    let out = '';
    let run = start;
    for (;;) {
      if (this.position >= this.text.length) this.fail('unterminated string');
      const c = this.text.charCodeAt(this.position);
      if (c === 0x22) {
        out += this.text.slice(run, this.position);
        this.position++;
        return out;
      }
      if (c < 0x20) this.fail('control character in string');
      if (c !== 0x5c) {
        this.position++;
        continue;
      }
      out += this.text.slice(run, this.position);
      const e = this.text[this.position + 1];
      const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (e !== undefined && e in simple) {
        out += simple[e];
        this.position += 2;
      } else if (e === 'u') {
        const hex = this.text.slice(this.position + 2, this.position + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('bad \\u escape');
        out += String.fromCharCode(Number.parseInt(hex, 16));
        this.position += 6;
      } else {
        this.fail('bad escape');
      }
      run = this.position;
    }
  }

  number(): JSONValue {
    const match = /^-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.text.slice(this.position));
    if (match === null) return this.fail('bad number');
    const literal = match[0];
    this.position += literal.length;
    const value = Number(literal);
    if (match[1] === undefined && match[2] === undefined) return new SwiftInt(value);
    return value;
  }
}
