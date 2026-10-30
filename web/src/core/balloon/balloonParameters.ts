// Ported from mac/Sources/BalloonStudio/BalloonGeometry.swift @ cbda68d (lines 3-97:
// BalloonParameters, normalized(), init(from:)).
//
// Swift's struct with computed properties becomes the frozen `BalloonParameters` type of
// core/types.ts plus free functions of the same names. `fromJSON` follows JSONDecoder as measured
// in web/tests/fixtures/swift/balloonDecode.txt, not JSON.parse (see scanJSONObject).
import { encodeJSONCompact, type JSONObject } from '../swift/json';
import { formatFixed } from '../swift/format';
import { swiftMax, swiftMin } from '../swift/minmax';
import { intTrunc, rounded } from '../swift/rounding';
import type { BalloonParameters } from '../types';
import * as CeilingLoop from './ceilingLoop';

/** Swift `BalloonParameters()`; `overrides` are the arguments of its memberwise initializer. */
export function makeBalloonParameters(overrides: Partial<BalloonParameters> = {}): BalloonParameters {
  return {
    height: 220,
    diameter: 180,
    panels: 20,
    panelDepth: 4,
    neckDiameter: 32,
    neckHeight: 6,
    shoulder: 65,
    hollow: false,
    wallThickness: 1.2,
    stringHoles: false,
    cordClearance: 3,
    hangingLoop: false,
    hangingClearance: 4,
    hangingThickness: 12,
    hangingWall: 6,
    hangingFillet: 4,
    hangingCrownThickness: 5,
    ...overrides,
  };
}

export const classic: BalloonParameters = Object.freeze(makeBalloonParameters());
export const round: BalloonParameters = Object.freeze(makeBalloonParameters({ height: 190, diameter: 190, panels: 16, panelDepth: 4, neckDiameter: 34, neckHeight: 6, shoulder: 57 }));
export const tall: BalloonParameters = Object.freeze(makeBalloonParameters({ height: 245, diameter: 160, panels: 24, panelDepth: 5, neckDiameter: 28, neckHeight: 8, shoulder: 68 }));

export function maximumNeckDiameter(p: BalloonParameters): number {
  return swiftMin(80, p.diameter * 0.6);
}
export function maximumNeckHeight(p: BalloonParameters): number {
  return swiftMin(20, p.height * 0.15);
}
export function hasStringHoles(p: BalloonParameters): boolean {
  return p.stringHoles;
}
export function loopHeight(p: BalloonParameters): number {
  return p.hangingLoop ? CeilingLoop.height(p) : 0;
}
export function totalHeight(p: BalloonParameters): number {
  return p.height + loopHeight(p);
}
export function maximumHeight(p: BalloonParameters): number {
  return swiftMin(250, Math.floor(256 - loopHeight(p)));
}
// An extra 0.2 mm protects the perforated neck where a faceted arc spans
// a diamond opening. Keep the main light-diffusing envelope unchanged.
export function neckWallThickness(p: BalloonParameters): number {
  return hasStringHoles(p) ? swiftMax(2, p.wallThickness) + 0.2 : p.wallThickness;
}
export function minimumNeckDiameter(p: BalloonParameters): number {
  return hasStringHoles(p) ? swiftMax(20, 4 * p.cordClearance + 2 * neckWallThickness(p) + 1) : 12;
}
export function minimumNeckHeight(p: BalloonParameters): number {
  return hasStringHoles(p) ? 12 : 3;
}
export function fitsPrinter(p: BalloonParameters): boolean {
  return p.diameter <= 256 && totalHeight(p) <= 256;
}
export function fitsWithBrim(p: BalloonParameters): boolean {
  return swiftMax(p.diameter, p.neckDiameter + 16) <= 256 && totalHeight(p) <= 256;
}
export function openingDiameter(p: BalloonParameters): number {
  return p.neckDiameter - 2 * neckWallThickness(p);
}
export function filename(p: BalloonParameters): string {
  const suffix = p.hollow ? `-hollow-${formatFixed(p.wallThickness, 1)}mm` : '';
  return `Balloon-${intTrunc(p.diameter)}x${intTrunc(p.height)}mm-${p.panels}panels${suffix}${hasStringHoles(p) ? '-tethers' : ''}${p.hangingLoop ? '-hanger' : ''}.stl`;
}

function clamp(v: number, lowerBound: number, upperBound: number, fallback: number): number {
  return Number.isFinite(v) ? swiftMin(upperBound, swiftMax(lowerBound, v)) : fallback;
}

/** Swift `normalized()`: the hanger first, because `height` depends on `loopHeight`. */
export function normalized(input: BalloonParameters): BalloonParameters {
  const p = { ...input };
  p.hangingClearance = clamp(input.hangingClearance, 2, 5, 4);
  p.hangingThickness = clamp(input.hangingThickness, 8, 16, 12);
  p.hangingWall = clamp(input.hangingWall, 4, 8, 6);
  p.hangingFillet = clamp(input.hangingFillet, 2.5, 5, 4);
  p.hangingCrownThickness = clamp(input.hangingCrownThickness, 3.4, 8, 5);
  p.height = clamp(input.height, 80, maximumHeight(p), 220);
  p.diameter = clamp(input.diameter, 60, 240, 180);
  // Groups of four place a panel ridge on each cardinal axis, preserving
  // the exact requested X and Y dimensions without stretching the neck.
  p.panels = intTrunc(rounded(swiftMin(32, swiftMax(8, input.panels)) / 4)) * 4;
  p.panelDepth = clamp(input.panelDepth, 0, 8, 4);
  p.shoulder = clamp(input.shoulder, 50, 75, 65);
  p.wallThickness = clamp(input.wallThickness, 0.8, 2.4, 1.2);
  p.cordClearance = clamp(input.cordClearance, 2, 5, 3);
  p.neckDiameter = clamp(input.neckDiameter, minimumNeckDiameter(p), maximumNeckDiameter(p), 32);
  p.neckHeight = clamp(input.neckHeight, minimumNeckHeight(p), maximumNeckHeight(p), minimumNeckHeight(p));
  return p;
}

// MARK: Decoding (Swift `init(from:)`)

/** A failed `JSONDecoder().decode(BalloonParameters.self, …)`. */
export class BalloonDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalloonDecodeError';
  }
}

/** A JSON number still in source form: JSONDecoder converts it per requested type. */
class RawNumber {
  constructor(readonly lexeme: string) {}
}

const INT_LIMIT = 9223372036854775808; // 2^63, Swift Int.max + 1

/** RFC 8259 number: `01`, `1e`, `-`, `.5` and `5.` are type errors once a field reads them. */
const JSON_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

function decodeDouble(value: unknown, key: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof RawNumber && JSON_NUMBER.test(value.lexeme)) {
    const d = Number(value.lexeme);
    // Out-of-range literals fail in both directions: 1e400, but also 1e-400 and 2e-324. Only a
    // literal whose digits are all zero may read as zero.
    // SWIFT-DIFF: Foundation also rejects some zero literals with a positive exponent (0e5, 0e1,
    // 0.00e5, -0.0e5, but not 0e0, 0e+5, -0e5, 0.0e5). No writer produces them; they read as 0 here.
    if (Number.isFinite(d) && (d !== 0 || !/[1-9]/.test((value.lexeme.split(/[eE]/)[0] as string)))) return d;
  }
  throw new BalloonDecodeError(`${key}: expected Double`);
}

function decodeInt(value: unknown, key: string): number {
  let d: number | undefined;
  if (typeof value === 'number') d = value;
  else if (value instanceof RawNumber && JSON_NUMBER.test(value.lexeme)) {
    // Digits alone convert exactly. Anything else goes through Double, so 1.50e1 is 15, 1e-400
    // is 0 and 1.000…01 is 1 (measured).
    if (/^-?[0-9]+$/.test(value.lexeme)) {
      const big = BigInt(value.lexeme);
      if (big < -9223372036854775808n || big > 9223372036854775807n) throw new BalloonDecodeError(`${key}: expected Int`);
      return Number(big) + 0;
    }
    d = Number(value.lexeme);
  }
  if (d !== undefined && Number.isInteger(d) && d >= -INT_LIMIT && d < INT_LIMIT) return d + 0;
  throw new BalloonDecodeError(`${key}: expected Int`);
}

function decodeBool(value: unknown, key: string): boolean {
  if (typeof value === 'boolean') return value;
  throw new BalloonDecodeError(`${key}: expected Bool`);
}

/** The `init(from:)` body. `decodeIfPresent`: absent or null is nil, a wrong type throws. */
function decodeFields(get: (key: string) => unknown): BalloonParameters {
  const double = (key: string, fallback: number): number => {
    const v = get(key);
    return v === undefined || v === null ? fallback : decodeDouble(v, key);
  };
  const int = (key: string, fallback: number): number => {
    const v = get(key);
    return v === undefined || v === null ? fallback : decodeInt(v, key);
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const v = get(key);
    return v === undefined || v === null ? fallback : decodeBool(v, key);
  };
  const d = classic;
  return {
    height: double('height', d.height),
    diameter: double('diameter', d.diameter),
    panels: int('panels', d.panels),
    panelDepth: double('panelDepth', d.panelDepth),
    neckDiameter: double('neckDiameter', d.neckDiameter),
    neckHeight: double('neckHeight', d.neckHeight),
    shoulder: double('shoulder', d.shoulder),
    hollow: bool('hollow', false),
    wallThickness: double('wallThickness', 1.2),
    stringHoles: bool('stringHoles', false),
    cordClearance: double('cordClearance', 3),
    hangingLoop: bool('hangingLoop', false),
    hangingClearance: double('hangingClearance', 4),
    hangingThickness: double('hangingThickness', d.hangingThickness),
    hangingWall: double('hangingWall', d.hangingWall),
    hangingFillet: double('hangingFillet', d.hangingFillet),
    hangingCrownThickness: double('hangingCrownThickness', d.hangingCrownThickness),
  };
}

/** The same decoder for a value that JSON.parse (or the app) already produced. */
export function fromValue(value: unknown): BalloonParameters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BalloonDecodeError('Expected a keyed container');
  const c = value as Readonly<Record<string, unknown>>;
  return decodeFields((key) => (Object.prototype.hasOwnProperty.call(c, key) ? c[key] : undefined));
}

/** Swift `JSONDecoder().decode(BalloonParameters.self, from:)`. */
export function fromJSON(text: string): BalloonParameters {
  const fields = scanJSONObject(text);
  return decodeFields((key) => fields.get(key));
}

/** Swift `JSONEncoder` with `.sortedKeys`, as StableJSON.swift configures it. */
export function toJSON(p: BalloonParameters): string {
  return encodeJSONCompact(p as unknown as JSONObject);
}

// Swift's JSON scanner differs from JSON.parse, all measured (balloonDecode.txt): it skips one BOM,
// takes the FIRST of two equal keys, allows a trailing comma in objects and arrays, and only
// converts the values a decoder reads, so `{"other":01}` or a raw newline in an unused string pass.

const fail = (at: number): never => {
  throw new BalloonDecodeError(`Invalid JSON at ${at}`);
};

function scanJSONObject(text: string): Map<string, unknown> {
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
      if (i >= text.length) fail(i);
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        i++;
        return text.slice(start, i);
      }
      if (c === 0x5c) {
        if (text.charCodeAt(i + 1) === 0x75) {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail(i);
          i += 6;
        } else i += 2;
      } else i++;
    }
  };
  /** Moves past any value; numbers come back in source form. */
  const value = (): unknown => {
    const c = text[i];
    if (c === '{') {
      object(() => undefined);
      return OPAQUE;
    }
    if (c === '[') {
      i++;
      whitespace();
      if (text[i] === ']') {
        i++;
        return OPAQUE;
      }
      for (;;) {
        whitespace();
        value();
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
        } else fail(i);
      }
    }
    if (c === '"') {
      string();
      return OPAQUE;
    }
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
    return fail(i);
  };
  /** The container at `i`, reporting each key and value to `entry`. */
  const object = (entry: (key: string, v: unknown) => void): void => {
    i++;
    whitespace();
    if (text[i] === '}') {
      i++;
      return;
    }
    for (;;) {
      whitespace();
      if (text[i] !== '"') fail(i);
      const keyAt = i;
      const key = string();
      whitespace();
      if (text[i] !== ':') fail(i);
      i++;
      whitespace();
      const v = value();
      let decodedKey: unknown;
      try {
        decodedKey = JSON.parse(key);
      } catch {
        fail(keyAt);
      }
      entry(decodedKey as string, v);
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
      } else fail(i);
    }
  };
  const fields = new Map<string, unknown>();
  whitespace();
  if (text[i] !== '{') throw new BalloonDecodeError('Expected a keyed container');
  object((key, v) => {
    if (!fields.has(key)) fields.set(key, v);
  });
  whitespace();
  if (i !== text.length) fail(i);
  return fields;
}

/** A string or container: valid JSON that no BalloonParameters field accepts. */
const OPAQUE = Object.freeze({});
