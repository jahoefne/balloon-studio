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
//
// JSONDecoder (reading settings) is not JSON.parse: see JSONKeyedContainer at the end of this file,
// measured with probes/{balloonDecode,jsonDecoder}.swift.
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

// MARK: Decoding as JSONDecoder does

/** `localizedDescription` of DecodingError.keyNotFound and .valueNotFound. */
export const JSON_DECODE_MISSING_MESSAGE = 'The data couldn’t be read because it is missing.';
/** `localizedDescription` of DecodingError.typeMismatch and .dataCorrupted. */
export const JSON_DECODE_FORMAT_MESSAGE = 'The data couldn’t be read because it isn’t in the correct format.';

/** A failed `JSONDecoder().decode`; `message` is the DecodingError's `localizedDescription`. */
export class JSONDecodeError extends Error {
  readonly kind: 'missing' | 'format';
  constructor(kind: 'missing' | 'format') {
    super(kind === 'missing' ? JSON_DECODE_MISSING_MESSAGE : JSON_DECODE_FORMAT_MESSAGE);
    this.name = 'JSONDecodeError';
    this.kind = kind;
  }
}

const formatError = (): JSONDecodeError => new JSONDecodeError('format');
const missingError = (): JSONDecodeError => new JSONDecodeError('missing');

/** A JSON number in source form: JSONDecoder converts it per requested type. */
class RawNumber {
  constructor(readonly lexeme: string) {}
}

/** A JSON string in source form, quotes included: converted only when a field reads it. */
class RawString {
  constructor(readonly literal: string) {}
}

/** A container nobody may read as Double, Int, Bool or String. */
const OPAQUE = Object.freeze({});

/** The deepest nesting JSONDecoder accepts, counting the outermost container. */
const MAXIMUM_DEPTH = 512;

const INT_LIMIT = 9223372036854775808; // 2^63, Swift Int.max + 1

/** RFC 8259 number: `01`, `1e`, `-`, `.5` and `5.` are errors once a field reads them. */
const JSON_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

/** A string or key as Swift converts it: JSON.parse's rules, and a lone surrogate escape fails too. */
function convertString(literal: string): string {
  let converted: unknown;
  try {
    converted = JSON.parse(literal);
  } catch {
    throw formatError();
  }
  if (/\p{Surrogate}/u.test(converted as string)) throw formatError();
  return converted as string;
}

function convertDouble(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof RawNumber && JSON_NUMBER.test(value.lexeme)) {
    const d = Number(value.lexeme);
    // Out-of-range literals fail in both directions: 1e400, but also 1e-400 and 2e-324. Only a
    // literal whose digits are all zero may read as zero.
    // SWIFT-DIFF: Foundation also rejects some zero literals with a positive exponent (0e5, 0e1,
    // 0.00e5, -0.0e5, but not 0e0, 0e+5, -0e5, 0.0e5). No writer produces them; they read as 0 here.
    if (Number.isFinite(d) && (d !== 0 || !/[1-9]/.test(value.lexeme.split(/[eE]/)[0] as string))) return d;
  }
  throw formatError();
}

function convertInt(value: unknown): number {
  let d: number | undefined;
  if (typeof value === 'number') d = value;
  else if (value instanceof RawNumber && JSON_NUMBER.test(value.lexeme)) {
    // Digits alone convert exactly. Anything else goes through Double, so 1.50e1 is 15, 1e-400
    // is 0 and 1.000…01 is 1 (measured).
    if (/^-?[0-9]+$/.test(value.lexeme)) {
      const big = BigInt(value.lexeme);
      if (big < -9223372036854775808n || big > 9223372036854775807n) throw formatError();
      return Number(big) + 0;
    }
    d = Number(value.lexeme);
  }
  if (d !== undefined && Number.isInteger(d) && d >= -INT_LIMIT && d < INT_LIMIT) return d + 0;
  throw formatError();
}

function convertBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  throw formatError();
}

function convertStringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof RawString) return convertString(value.literal);
  throw formatError();
}

function convertEnum<T extends string>(value: unknown, cases: readonly T[]): T {
  const raw = convertStringValue(value);
  if (!(cases as readonly string[]).includes(raw)) throw formatError();
  return raw as T;
}

/**
 * Swift `decoder.container(keyedBy:)` of JSONDecoder, for porting `init(from:)` and synthesized
 * Codable. Call the readers in Swift's declaration order: the first failure wins, and it decides
 * the message. All measured (tests/fixtures/swift/{balloonDecode,jsonDecoder}.txt):
 *
 * Document
 * - One leading BOM is skipped. Whitespace is space, tab, LF and CR only.
 * - Of two equal keys the FIRST wins, also when its value is null or the wrong type; escaped keys
 *   count (`"\u0073"` is `"s"`).
 * - A comma after the last object member or array element is allowed; `[,]` and `{,}` are not.
 * - Values no field reads are only skimmed: `{"o":01}`, `{"o":1e}`, `{"o":--1}`, a raw newline or
 *   `\x` in an unread string, and the keys of nested objects pass. A truncated `\u12`, an unknown
 *   word (`tru`), `.5`, `+1` and nesting deeper than 512 containers fail anywhere. Keys of the
 *   container itself are converted up front, so a bad one fails the document.
 *
 * Conversions of a value that is read
 * - Double: the number grammar of RFC 8259. Out-of-range literals are errors in both directions
 *   (`1e400`, `1e-400`, `2e-324`); subnormals (`1e-320`) are fine.
 * - Int: a digit-only literal is checked exactly against Int64. Anything else goes through Double
 *   and must be integral there: `1.50e1` is 15, `1e-400` is 0, `1.5` and `9.223372036854775807e18`
 *   fail.
 * - Bool: only `true` and `false`. String: no raw control characters, known escapes only, no lone
 *   surrogate escape. A number is never read as a Bool or a String, nor the reverse.
 *
 * Errors, as JSONDecodeError with the DecodingError's `localizedDescription`
 * - JSON_DECODE_MISSING_MESSAGE: a null document; a required key that is absent or null. **Except
 *   Bool**: `decode(Bool.self)` on null is a type mismatch, so the other message.
 * - JSON_DECODE_FORMAT_MESSAGE: everything else: syntax errors, a document that is no object, a
 *   wrong type, an unknown enum raw value.
 * - `…IfPresent`: absent or null gives undefined; a wrong type fails as above.
 */
export class JSONKeyedContainer {
  private constructor(private readonly read: (key: string) => unknown) {}

  /** `JSONDecoder().decode(T.self, from: text)` up to the keyed container. */
  static fromJSON(text: string): JSONKeyedContainer {
    const fields = scanKeyedContainer(text);
    return new JSONKeyedContainer((key) => fields.get(key));
  }

  /** The same readers for a value that JSON.parse or the app already produced. */
  static fromValue(value: unknown): JSONKeyedContainer {
    if (value === null) throw missingError();
    if (typeof value !== 'object' || Array.isArray(value)) throw formatError();
    const c = value as Readonly<Record<string, unknown>>;
    return new JSONKeyedContainer((key) => (Object.prototype.hasOwnProperty.call(c, key) ? c[key] : undefined));
  }

  private required(key: string): unknown {
    const value = this.read(key);
    if (value === undefined || value === null) throw missingError();
    return value;
  }

  /** `try c.decode(Double.self, forKey: key)` */
  double(key: string): number {
    return convertDouble(this.required(key));
  }
  /** `try c.decode(Int.self, forKey: key)` */
  int(key: string): number {
    return convertInt(this.required(key));
  }
  /** `try c.decode(Bool.self, forKey: key)`: null is a type mismatch here, not a missing value. */
  bool(key: string): boolean {
    const value = this.read(key);
    if (value === undefined) throw missingError();
    return convertBool(value);
  }
  /** `try c.decode(String.self, forKey: key)` */
  string(key: string): string {
    return convertStringValue(this.required(key));
  }
  /** `try c.decode(T.self, forKey: key)` for a String-backed enum with these raw values. */
  enumeration<T extends string>(key: string, cases: readonly T[]): T {
    return convertEnum(this.required(key), cases);
  }

  /** `try c.decodeIfPresent(Double.self, forKey: key)` */
  doubleIfPresent(key: string): number | undefined {
    const value = this.read(key);
    return value === undefined || value === null ? undefined : convertDouble(value);
  }
  /** `try c.decodeIfPresent(Int.self, forKey: key)` */
  intIfPresent(key: string): number | undefined {
    const value = this.read(key);
    return value === undefined || value === null ? undefined : convertInt(value);
  }
  /** `try c.decodeIfPresent(Bool.self, forKey: key)` */
  boolIfPresent(key: string): boolean | undefined {
    const value = this.read(key);
    return value === undefined || value === null ? undefined : convertBool(value);
  }
  /** `try c.decodeIfPresent(String.self, forKey: key)` */
  stringIfPresent(key: string): string | undefined {
    const value = this.read(key);
    return value === undefined || value === null ? undefined : convertStringValue(value);
  }
  /** `try c.decodeIfPresent(T.self, forKey: key)` for a String-backed enum with these raw values. */
  enumerationIfPresent<T extends string>(key: string, cases: readonly T[]): T | undefined {
    const value = this.read(key);
    return value === undefined || value === null ? undefined : convertEnum(value, cases);
  }
  /** `(try? c.decodeIfPresent(String.self, forKey: key)) ?? nil`: never throws. */
  lenientString(key: string): string | undefined {
    try {
      return this.stringIfPresent(key);
    } catch (error) {
      if (error instanceof JSONDecodeError) return undefined;
      throw error;
    }
  }
}

/** Skims the document and returns the outermost object's first value per key, unconverted. */
function scanKeyedContainer(text: string): Map<string, unknown> {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const whitespace = (): void => {
    for (;;) {
      const c = text.charCodeAt(i);
      if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return;
      i++;
    }
  };
  /** Moves past a string; returns its source slice with the quotes. */
  const string = (): string => {
    const start = i;
    i++;
    for (;;) {
      if (i >= text.length) throw formatError();
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        i++;
        return text.slice(start, i);
      }
      if (c === 0x5c) {
        if (text.charCodeAt(i + 1) === 0x75) {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) throw formatError();
          i += 6;
        } else i += 2;
      } else i++;
    }
  };
  /** Moves past any value; numbers and strings come back in source form. */
  const value = (depth: number): unknown => {
    const c = text[i];
    if (c === '{') {
      object(depth + 1, () => undefined);
      return OPAQUE;
    }
    if (c === '[') {
      if (depth + 1 > MAXIMUM_DEPTH) throw formatError();
      i++;
      whitespace();
      if (text[i] === ']') {
        i++;
        return OPAQUE;
      }
      for (;;) {
        whitespace();
        value(depth + 1);
        whitespace();
        if (text[i] === ',') {
          i++;
          whitespace();
          if (text[i] === ']') {
            i++;
            return OPAQUE;
          }
        } else if (text[i] === ']') {
          i++;
          return OPAQUE;
        } else throw formatError();
      }
    }
    if (c === '"') return new RawString(string());
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) {
      const start = i;
      while (i < text.length && '0123456789+-.eE'.includes(text[i] as string)) i++;
      return new RawNumber(text.slice(start, i));
    }
    for (const [literal, v] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(literal, i)) {
        i += literal.length;
        return v;
      }
    }
    throw formatError();
  };
  /** The object at `i`, reporting each key's source slice and value to `entry`. */
  const object = (depth: number, entry: (key: string, v: unknown) => void): void => {
    if (depth > MAXIMUM_DEPTH) throw formatError();
    i++;
    whitespace();
    if (text[i] === '}') {
      i++;
      return;
    }
    for (;;) {
      whitespace();
      if (text[i] !== '"') throw formatError();
      const key = string();
      whitespace();
      if (text[i] !== ':') throw formatError();
      i++;
      whitespace();
      entry(key, value(depth));
      whitespace();
      if (text[i] === ',') {
        i++;
        whitespace();
        if (text[i] === '}') {
          i++;
          return;
        }
      } else if (text[i] === '}') {
        i++;
        return;
      } else throw formatError();
    }
  };
  whitespace();
  const fields = new Map<string, unknown>();
  if (text[i] === '{') {
    const entries: [string, unknown][] = [];
    object(1, (key, v) => entries.push([key, v]));
    whitespace();
    if (i !== text.length) throw formatError();
    for (const [key, v] of entries) {
      const converted = convertString(key);
      if (!fields.has(converted)) fields.set(converted, v);
    }
    return fields;
  }
  // Not an object: a whole null document is a missing value, all else a wrong format.
  if (text.startsWith('null', i)) {
    i += 4;
    whitespace();
    if (i === text.length) throw missingError();
  }
  throw formatError();
}
