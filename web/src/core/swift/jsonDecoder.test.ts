// Tests for JSONKeyedContainer in json.ts against tests/fixtures/swift/jsonDecoder.txt
// (probes/jsonDecoder.swift). The number and document tables of balloonDecode.txt run through the
// same class in tests/balloon.test.ts.
import { describe, expect, it } from 'vitest';
import { fixtureText, probeSection } from '../../../tests/support/swiftProbe';
import { INVALID_SETTINGS_MESSAGE } from '../api';
import { JSON_DECODE_FORMAT_MESSAGE, JSON_DECODE_MISSING_MESSAGE, JSONDecodeError, JSONKeyedContainer } from './json';

const dump = fixtureText('swift/jsonDecoder.txt');
const unescape = (s: string): string => s.replace(/<U\+([0-9A-F]+)>/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
/** The probe's `show`. */
const show = (s: string): string =>
  [...s]
    .map((ch) => {
      const c = ch.codePointAt(0) as number;
      return c < 0x21 || c > 0x7e ? `<U+${c.toString(16).toUpperCase().padStart(4, '0')}>` : ch;
    })
    .join('');
const rows = (section: string): [string, string][] =>
  probeSection(dump, section)
    .filter((row) => row.includes('\t'))
    .map((row) => row.split('\t') as [string, string]);

/** The probe's outcome column for one decode. */
function outcome(decode: () => string): string {
  try {
    return `ok ${decode()}`;
  } catch (error) {
    expect(error).toBeInstanceOf(JSONDecodeError);
    const e = error as JSONDecodeError;
    expect(e.message).toBe(e.kind === 'missing' ? JSON_DECODE_MISSING_MESSAGE : JSON_DECODE_FORMAT_MESSAGE);
    return e.kind;
  }
}

/** Synthesized Codable of `struct Required {d: Double; i: Int; b: Bool; s: String}`. */
const required = (c: JSONKeyedContainer): string => {
  c.double('d');
  c.int('i');
  c.bool('b');
  c.string('s');
  return '';
};
const optionals = (c: JSONKeyedContainer): { s: string | undefined } => {
  c.doubleIfPresent('d');
  c.intIfPresent('i');
  c.boolIfPresent('b');
  return { s: c.stringIfPresent('s') };
};
const showOptional = (s: string | undefined): string => (s === undefined ? 'nil' : show(s));

describe('JSONKeyedContainer', () => {
  it('uses the texts of the frozen API', () => {
    expect(JSON_DECODE_FORMAT_MESSAGE).toBe(INVALID_SETTINGS_MESSAGE);
    expect(new JSONDecodeError('missing').message).toBe('The data couldn’t be read because it is missing.');
  });
  it('required keys: the first failure in declaration order decides the text', () => {
    const table = rows('REQUIRED');
    expect(table.length).toBeGreaterThan(25);
    for (const [escaped, expected] of table) {
      expect(outcome(() => required(JSONKeyedContainer.fromJSON(unescape(escaped)))), escaped).toBe(expected);
    }
  });
  it('optional keys', () => {
    for (const [escaped, expected] of rows('OPTIONAL')) {
      expect(outcome(() => (optionals(JSONKeyedContainer.fromJSON(unescape(escaped))), '')), escaped).toBe(expected);
    }
  });
  it('String-backed enums', () => {
    for (const [escaped, expected] of rows('ENUM')) {
      expect(outcome(() => JSONKeyedContainer.fromJSON(unescape(escaped)).enumeration('k', ['one', 'two'])), escaped).toBe(expected);
    }
    expect(JSONKeyedContainer.fromJSON('{}').enumerationIfPresent('k', ['one'])).toBeUndefined();
    expect(JSONKeyedContainer.fromJSON('{"k":null}').enumerationIfPresent('k', ['one'])).toBeUndefined();
    expect(() => JSONKeyedContainer.fromJSON('{"k":"two"}').enumerationIfPresent('k', ['one'])).toThrow(JSON_DECODE_FORMAT_MESSAGE);
  });
  it('try? decodeIfPresent(String) never throws on the value', () => {
    for (const [escaped, expected] of rows('LENIENT')) {
      expect(outcome(() => showOptional(JSONKeyedContainer.fromJSON(unescape(escaped)).lenientString('s'))), escaped).toBe(expected);
    }
  });
  it('strings that are read convert strictly', () => {
    const table = rows('STRING');
    expect(table.length).toBeGreaterThan(25);
    for (const [escaped, expected] of table) {
      // The dump writes a raw space in a string as  ; the probe's source had `\ ` in one row.
      const text = unescape(escaped);
      expect(outcome(() => showOptional(optionals(JSONKeyedContainer.fromJSON(text)).s)), escaped).toBe(expected);
    }
  });
  it('keys: first wins, escapes count, the container’s own keys convert up front', () => {
    for (const [escaped, expected] of rows('KEYS')) {
      expect(outcome(() => showOptional(optionals(JSONKeyedContainer.fromJSON(unescape(escaped))).s)), escaped).toBe(expected);
    }
  });
  it('structure: unread values are skimmed, nesting stops at 512', () => {
    const deepArray = (n: number): string => `{"o":${'['.repeat(n)}${']'.repeat(n)}}`;
    const deepObject = (n: number): string => `${'{"o":'.repeat(n)}1${'}'.repeat(n)}`;
    const table = rows('STRUCTURE');
    expect(table.length).toBeGreaterThan(50);
    for (const [name, expected] of table) {
      const deep = /^deep-(array|object)-(\d+)$/.exec(name);
      const text = deep === null ? unescape(name) : deep[1] === 'array' ? deepArray(Number(deep[2])) : deepObject(Number(deep[2]));
      expect(outcome(() => (optionals(JSONKeyedContainer.fromJSON(text)), '')), name).toBe(expected);
    }
  });
  it('fromValue applies the same conversions to app objects', () => {
    const c = JSONKeyedContainer.fromValue({ d: 1.5, i: -0, b: true, s: 'x', n: null, wrong: 'x', float: 1.5, inf: Infinity });
    expect(c.double('d')).toBe(1.5);
    expect(Object.is(c.int('i'), 0)).toBe(true);
    expect(c.bool('b')).toBe(true);
    expect(c.string('s')).toBe('x');
    expect(c.doubleIfPresent('n')).toBeUndefined();
    expect(c.doubleIfPresent('absent')).toBeUndefined();
    expect(() => c.double('n')).toThrow(JSON_DECODE_MISSING_MESSAGE);
    expect(() => c.double('absent')).toThrow(JSON_DECODE_MISSING_MESSAGE);
    expect(() => c.bool('n')).toThrow(JSON_DECODE_FORMAT_MESSAGE);
    expect(() => c.bool('absent')).toThrow(JSON_DECODE_MISSING_MESSAGE);
    expect(() => c.double('wrong')).toThrow(JSON_DECODE_FORMAT_MESSAGE);
    expect(() => c.int('float')).toThrow(JSON_DECODE_FORMAT_MESSAGE);
    expect(() => c.double('inf')).toThrow(JSON_DECODE_FORMAT_MESSAGE);
    expect(c.lenientString('wrong')).toBe('x');
    expect(c.lenientString('d')).toBeUndefined();
    expect(() => JSONKeyedContainer.fromValue(null)).toThrow(JSON_DECODE_MISSING_MESSAGE);
    for (const bad of [1, 'x', true, [], undefined]) {
      expect(() => JSONKeyedContainer.fromValue(bad)).toThrow(JSON_DECODE_FORMAT_MESSAGE);
    }
    expect(JSONKeyedContainer.fromValue(Object.create({ d: 1 })).doubleIfPresent('d')).toBeUndefined();
  });
});
