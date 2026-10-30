// Ported from mac/Sources/BalloonStudio/BalloonGeometry.swift @ cbda68d (lines 3-97:
// BalloonParameters, normalized(), init(from:)).
//
// Swift's struct with computed properties becomes the frozen `BalloonParameters` type of
// core/types.ts plus free functions of the same names. `fromJSON` follows JSONDecoder, not
// JSON.parse (see JSONKeyedContainer in core/swift/json.ts).
import { encodeJSONCompact, JSONDecodeError, JSONKeyedContainer, type JSONObject } from '../swift/json';
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
export { JSONDecodeError as BalloonDecodeError };

/** The `init(from:)` body. */
function decodeFields(c: JSONKeyedContainer): BalloonParameters {
  const d = classic;
  return {
    height: c.doubleIfPresent('height') ?? d.height,
    diameter: c.doubleIfPresent('diameter') ?? d.diameter,
    panels: c.intIfPresent('panels') ?? d.panels,
    panelDepth: c.doubleIfPresent('panelDepth') ?? d.panelDepth,
    neckDiameter: c.doubleIfPresent('neckDiameter') ?? d.neckDiameter,
    neckHeight: c.doubleIfPresent('neckHeight') ?? d.neckHeight,
    shoulder: c.doubleIfPresent('shoulder') ?? d.shoulder,
    hollow: c.boolIfPresent('hollow') ?? false,
    wallThickness: c.doubleIfPresent('wallThickness') ?? 1.2,
    stringHoles: c.boolIfPresent('stringHoles') ?? false,
    cordClearance: c.doubleIfPresent('cordClearance') ?? 3,
    hangingLoop: c.boolIfPresent('hangingLoop') ?? false,
    hangingClearance: c.doubleIfPresent('hangingClearance') ?? 4,
    hangingThickness: c.doubleIfPresent('hangingThickness') ?? d.hangingThickness,
    hangingWall: c.doubleIfPresent('hangingWall') ?? d.hangingWall,
    hangingFillet: c.doubleIfPresent('hangingFillet') ?? d.hangingFillet,
    hangingCrownThickness: c.doubleIfPresent('hangingCrownThickness') ?? d.hangingCrownThickness,
  };
}

/** The same decoder for a value that JSON.parse (or the app) already produced. */
export function fromValue(value: unknown): BalloonParameters {
  return decodeFields(JSONKeyedContainer.fromValue(value));
}

/** Swift `JSONDecoder().decode(BalloonParameters.self, from:)`. */
export function fromJSON(text: string): BalloonParameters {
  return decodeFields(JSONKeyedContainer.fromJSON(text));
}

/** Swift `JSONEncoder` with `.sortedKeys`, as StableJSON.swift configures it. */
export function toJSON(p: BalloonParameters): string {
  return encodeJSONCompact(p as unknown as JSONObject);
}
