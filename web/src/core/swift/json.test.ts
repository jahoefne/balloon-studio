// Tests for json.ts against tests/fixtures/swift/{json,keys,keys2}.txt (probes/{json,keys,keys2}.swift).
import { describe, expect, it } from 'vitest';
import { fixtureText, probeSection } from '../../../tests/support/swiftProbe';
import {
  compareJSONSerializationKeys,
  encodeJSONCompact,
  encodeJSONCompactSerialization,
  encodeJSONPretty17g,
  escapeJSONString,
  parseJSONSerialization,
  SwiftInt,
  type JSONObject,
  type JSONValue,
} from './json';
import { swiftDescription } from './format';

const json = fixtureText('swift/json.txt');
const section = (name: string): string => probeSection(json, name).join('\n').replace(/\n+$/, '');

const CTRL = '\u0000\u0001\u0008\u0009\u000a\u000b\u000c\u000d\u001f\u007f"\\/é😀  ﻿<>&\'';
const KEY_NAMES = ['bandWidth', 'bands', 'a10', 'a9', 'B', 'a', '_x', 'Z', 'aB', 'ab', 'x_y', 'xY', 'x01', 'x1'];

/** The `Probe` struct of probes/json.swift. Swift Int fields are SwiftInt, Double fields numbers. */
function probeValue(): JSONObject {
  const value: Record<string, JSONValue | undefined> = {
    name: 'a/b',
    width: 230,
    small: 1e-5,
    arr: [1, 2.5, 1e-5],
    ints: [new SwiftInt(3), new SwiftInt(-4)],
    count: new SwiftInt(450),
    flag: true,
    off: false,
    missing: undefined,
    present: 0.3,
    inner: { b: 0.1, a: new SwiftInt(7) },
    kind: 'sun',
    negZero: -0,
    big: 1e16,
    big15: 1e15,
    big17: 123456789012345680,
    tiny: 5e-324,
    sum: 0.1 + 0.2,
    ctrl: CTRL,
    empty: [],
    nested: [[1, 2], []],
    dict: { k: 1, J: 2, _: 3, k2: 4, k10: 5 },
    // Swift Float 0.1: JSONEncoder prints the Float's own description ("0.1").
    float32: 0.1,
    maxD: Number.MAX_VALUE,
    minD: 1e-4,
    neg: -12.5,
  };
  for (const key of KEY_NAMES) value[key] = new SwiftInt(key === 'bands' ? 2 : 1);
  value.bandWidth = 1;
  return value;
}

/** Keys of a compact JSON object in written order (Object.keys would reorder integer-like keys). */
function writtenKeys(text: string): string[] {
  return Array.from(text.matchAll(/"((?:[^"\\]|\\.)*)":/g), (m) => JSON.parse(`"${m[1] as string}"`) as string);
}

describe('encodeJSONCompact (JSONEncoder .sortedKeys)', () => {
  it('writes the probe struct byte for byte', () => {
    expect(encodeJSONCompact(probeValue())).toBe(section('ENCODER'));
  });

  it('sorts keys by code point', () => {
    const keys = writtenKeys(section('SER_KEYS'));
    const object = Object.fromEntries(keys.map((k) => [k, new SwiftInt(1)]));
    expect(encodeJSONCompact(object)).toBe(section('ENC_KEYS'));
  });

  it('formats doubles as description without ".0" and throws on non-finite numbers', () => {
    expect(encodeJSONCompact({ width: 230, z: -0, s: 1e-5, b: 1e16 })).toBe('{"b":1e+16,"s":1e-05,"width":230,"z":-0}');
    expect(() => encodeJSONCompact({ x: Number.NaN })).toThrow(RangeError);
    expect(() => encodeJSONCompact([Infinity])).toThrow(RangeError);
  });
});

describe('JSONSerialization writers', () => {
  const parameters = (): JSONValue => parseJSONSerialization(section('ENCODER'));
  const manifest = (): JSONObject => ({
    format_version: new SwiftInt(2),
    units: 'millimetres',
    parameters: parameters(),
    parts: [
      {
        file: 'a.stl',
        quantity: new SwiftInt(6),
        dimensions_mm: [169.45178757107396, 230.0, 0.3, 1e16, 1e-5, -0, 5e-324, 1e17, 1e21, 0.1],
      },
    ],
    load_rated: false,
    yes: true,
    emptyA: [],
    emptyD: {},
    dbl: 2.0,
    intNeg: new SwiftInt(-3),
    nsd: 0.5,
    f32: Math.fround(0.1),
    u8: new SwiftInt(3),
    nan_s: 'x/y',
  });

  it('pretty-prints the manifest of re-parsed JSONEncoder output byte for byte', () => {
    expect(encodeJSONPretty17g(manifest())).toBe(section('SER_PRETTY'));
  });

  it('writes the compact sorted form byte for byte', () => {
    expect(encodeJSONCompactSerialization(manifest())).toBe(section('SER_COMPACT'));
  });

  it('writes ThreeMF balloon-settings.json', () => {
    const density = swiftDescription(1.24);
    const config = {
      filament_colour: ['#FFFFFF', '#E0245E'],
      filament_type: ['PLA', 'PLA'],
      filament_diameter: ['1.75', '1.75'],
      filament_density: [density, density],
    };
    expect(encodeJSONCompactSerialization(config)).toBe(section('SER_CONFIG'));
  });

  it('escapes strings like Foundation', () => {
    expect(encodeJSONCompactSerialization({ s: CTRL })).toBe(section('SER_STR'));
    expect(escapeJSONString('a/b')).toBe('"a\\/b"');
  });

  it('keeps integer provenance through parsing (450 stays 450, -0 becomes 0, 1.0 becomes 1)', () => {
    const parsed = parseJSONSerialization('[1,2.5,1e-05,230,-0,1e+16,0.3,450,true,false,1.0,100000000000000000000,-0.0,1.7976931348623157e+308,5e-324,0.1]');
    expect(encodeJSONPretty17g(parsed)).toBe(section('SER_NUMS'));
  });

  it('rejects malformed JSON', () => {
    for (const bad of ['', '{', '[1,]', '{"a" 1}', '01', '"\\x"', 'tru', '[1] 2']) {
      expect(() => parseJSONSerialization(bad), bad).toThrow(SyntaxError);
    }
    expect(parseJSONSerialization(' {"a" : [ "\\u00e9\\n" , null ] } ')).toEqual({ a: ['é\n', null] });
  });
});

describe('compareJSONSerializationKeys (Darwin collation)', () => {
  it('orders the hand-picked probe keys like Swift (ASCII subset)', () => {
    const keys = writtenKeys(section('SER_KEYS')).filter((k) => /^[ -~]*$/.test(k));
    expect(keys.length).toBe(36);
    expect(keys.slice().reverse().sort(compareJSONSerializationKeys)).toEqual(keys);
  });

  it('orders 700 random ASCII keys like Swift, and JSONEncoder by code point', () => {
    const [serialization, encoder] = fixtureText('swift/keys.txt').split('\n') as [string, string];
    const keys = writtenKeys(serialization);
    expect(keys.length).toBe(700);
    const object = Object.fromEntries(keys.map((k) => [k, new SwiftInt(0)]));
    expect(encodeJSONCompactSerialization(object)).toBe(serialization);
    expect(encodeJSONCompact(object)).toBe(encoder);
  });

  it('places every printable ASCII punctuation character like Swift', () => {
    // The probe's two JSON objects ended up on one line (FileHandle vs print buffering).
    const both = fixtureText('swift/keys2.txt').trim();
    const split = both.indexOf('}{') + 1;
    const punctuation = both.slice(0, split);
    const numeric = both.slice(split);
    const object: Record<string, JSONValue> = {};
    for (let v = 32; v <= 126; v++) object['a' + String.fromCharCode(v) + 'b'] = new SwiftInt(v);
    expect(encodeJSONCompactSerialization(object)).toBe(punctuation);
    const keys = writtenKeys(numeric);
    expect(encodeJSONCompactSerialization(Object.fromEntries(keys.map((k) => [k, new SwiftInt(0)])))).toBe(numeric);
  });

  it('refuses keys outside printable ASCII instead of guessing', () => {
    expect(() => compareJSONSerializationKeys('ä', 'a')).toThrow(RangeError);
  });
});
