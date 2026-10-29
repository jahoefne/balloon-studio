// Ported from mac/Sources/BalloonStudio/BalloonGeometry.swift:3-97, CeilingLoop.swift:18-20,
// BalloonPatterns.swift:3-122, 254-267 and BalloonStudioApp.swift:113-114, 169-170 @ 03c9307.
// Parameters only: real normalizers, codecs, filenames and derived values.

import type { BalloonDerived, BalloonParameterApi, PatternDerived } from '../api';
import {
  BALLOON_PATTERNS,
  BALLOON_TEXT_FONTS,
  FILAMENT_COLORS,
  patternHasRelief,
  type BalloonParameters,
  type BalloonSnapshot,
  type PatternSettings,
  type PurgeSettings,
} from '../types';
import { PI } from '../swift/dmath';
import { container, ifPresent, makeCodec, required } from './json';
import { intTrunc, isSwiftWhitespace, printfFixed, rounded, swiftCharacters, swiftMax, swiftMin, swiftMin3 } from './swiftCompat';

const classic: BalloonParameters = Object.freeze({
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
});
const round: BalloonParameters = Object.freeze({ ...classic, height: 190, diameter: 190, panels: 16, panelDepth: 4, neckDiameter: 34, neckHeight: 6, shoulder: 57 });
const tall: BalloonParameters = Object.freeze({ ...classic, height: 245, diameter: 160, panels: 24, panelDepth: 5, neckDiameter: 28, neckHeight: 8, shoulder: 68 });

/** CeilingLoop.height: `foot + clearance + wall`, foot = fillet + 2. */
const ceilingLoopHeight = (p: BalloonParameters): number => p.hangingFillet + 2 + p.hangingClearance + p.hangingWall;

const loopHeight = (p: BalloonParameters): number => (p.hangingLoop ? ceilingLoopHeight(p) : 0);
const maximumHeight = (p: BalloonParameters): number => swiftMin(250, Math.floor(256 - loopHeight(p)));
const maximumNeckDiameter = (p: BalloonParameters): number => swiftMin(80, p.diameter * 0.6);
const maximumNeckHeight = (p: BalloonParameters): number => swiftMin(20, p.height * 0.15);
const neckWallThickness = (p: BalloonParameters): number =>
  p.stringHoles ? swiftMax(2, p.wallThickness) + 0.2 : p.wallThickness;
const minimumNeckDiameter = (p: BalloonParameters): number =>
  p.stringHoles ? swiftMax(20, 4 * p.cordClearance + 2 * neckWallThickness(p) + 1) : 12;
const minimumNeckHeight = (p: BalloonParameters): number => (p.stringHoles ? 12 : 3);

export const balloonFilename = (p: BalloonParameters): string => {
  const suffix = p.hollow ? `-hollow-${printfFixed(p.wallThickness, 1)}mm` : '';
  return `Balloon-${intTrunc(p.diameter)}x${intTrunc(p.height)}mm-${p.panels}panels${suffix}${p.stringHoles ? '-tethers' : ''}${p.hangingLoop ? '-hanger' : ''}.stl`;
};

const balloonDerived = (p: BalloonParameters): BalloonDerived => {
  const totalHeight = p.height + loopHeight(p);
  return {
    maximumNeckDiameter: maximumNeckDiameter(p),
    maximumNeckHeight: maximumNeckHeight(p),
    hasStringHoles: p.stringHoles,
    loopHeight: loopHeight(p),
    totalHeight,
    maximumHeight: maximumHeight(p),
    neckWallThickness: neckWallThickness(p),
    minimumNeckDiameter: minimumNeckDiameter(p),
    minimumNeckHeight: minimumNeckHeight(p),
    fitsPrinter: p.diameter <= 256 && totalHeight <= 256,
    fitsWithBrim: swiftMax(p.diameter, p.neckDiameter + 16) <= 256 && totalHeight <= 256,
    openingDiameter: p.neckDiameter - 2 * neckWallThickness(p),
    filename: balloonFilename(p),
  };
};

const clamp = (v: number, lower: number, upper: number, fallback: number): number =>
  Number.isFinite(v) ? swiftMin(upper, swiftMax(lower, v)) : fallback;

/** BalloonGeometry.swift:45-67, in the same order: the hanger before `height`, which depends on it. */
export const normalizeBalloon = (input: BalloonParameters): BalloonParameters => {
  const p = { ...input };
  p.hangingClearance = clamp(input.hangingClearance, 2, 5, 4);
  p.hangingThickness = clamp(input.hangingThickness, 8, 16, 12);
  p.hangingWall = clamp(input.hangingWall, 4, 8, 6);
  p.hangingFillet = clamp(input.hangingFillet, 2.5, 5, 4);
  p.hangingCrownThickness = clamp(input.hangingCrownThickness, 3.4, 8, 5);
  p.height = clamp(input.height, 80, maximumHeight(p), 220);
  p.diameter = clamp(input.diameter, 60, 240, 180);
  p.panels = intTrunc(rounded(swiftMin(32, swiftMax(8, input.panels)) / 4)) * 4;
  p.panelDepth = clamp(input.panelDepth, 0, 8, 4);
  p.shoulder = clamp(input.shoulder, 50, 75, 65);
  p.wallThickness = clamp(input.wallThickness, 0.8, 2.4, 1.2);
  p.cordClearance = clamp(input.cordClearance, 2, 5, 3);
  p.neckDiameter = clamp(input.neckDiameter, minimumNeckDiameter(p), maximumNeckDiameter(p), 32);
  p.neckHeight = clamp(input.neckHeight, minimumNeckHeight(p), maximumNeckHeight(p), minimumNeckHeight(p));
  return p;
};

/** BalloonGeometry.swift:76-96 */
const decodeBalloon = (value: unknown): BalloonParameters => {
  const c = container(value);
  const d = classic;
  return {
    height: ifPresent.double(c, 'height') ?? d.height,
    diameter: ifPresent.double(c, 'diameter') ?? d.diameter,
    panels: ifPresent.int(c, 'panels') ?? d.panels,
    panelDepth: ifPresent.double(c, 'panelDepth') ?? d.panelDepth,
    neckDiameter: ifPresent.double(c, 'neckDiameter') ?? d.neckDiameter,
    neckHeight: ifPresent.double(c, 'neckHeight') ?? d.neckHeight,
    shoulder: ifPresent.double(c, 'shoulder') ?? d.shoulder,
    hollow: ifPresent.bool(c, 'hollow') ?? false,
    wallThickness: ifPresent.double(c, 'wallThickness') ?? 1.2,
    stringHoles: ifPresent.bool(c, 'stringHoles') ?? false,
    cordClearance: ifPresent.double(c, 'cordClearance') ?? 3,
    hangingLoop: ifPresent.bool(c, 'hangingLoop') ?? false,
    hangingClearance: ifPresent.double(c, 'hangingClearance') ?? 4,
    hangingThickness: ifPresent.double(c, 'hangingThickness') ?? d.hangingThickness,
    hangingWall: ifPresent.double(c, 'hangingWall') ?? d.hangingWall,
    hangingFillet: ifPresent.double(c, 'hangingFillet') ?? d.hangingFillet,
    hangingCrownThickness: ifPresent.double(c, 'hangingCrownThickness') ?? d.hangingCrownThickness,
  };
};

// --- PatternSettings ---------------------------------------------------------

const patternDefaults: PatternSettings = Object.freeze({
  style: 'Solid',
  bands: 6,
  repeats: 8,
  rows: 2,
  size: 18,
  base: 'Saffron',
  detail: 'Cream',
  text: 'Hello',
  textFont: 'Rounded',
  textRepeats: 3,
  textHeight: 24,
  flightCompositionVersion: 3,
  reliefDepth: 2.4,
  capHeight: 18,
  flightBody: 'Cream',
  flightCap: 'Midnight blue',
});

const maximumTextHeight = (p: BalloonParameters): number => swiftMin(60, (p.height - p.neckHeight) * 0.28);
const maximumSize = (s: PatternSettings, p: BalloonParameters): number =>
  swiftMin3(
    40,
    ((p.height - p.neckHeight) * 0.5) / swiftMax(1, s.rows),
    ((PI * p.diameter * 0.55) / swiftMax(1, s.repeats)) * 0.75,
  );

const patternDerived = (s: PatternSettings, p: BalloonParameters): PatternDerived => {
  const hasRelief = patternHasRelief(s.style);
  const baseColor = hasRelief ? s.flightBody : s.base;
  const detailColor = hasRelief ? s.flightCap : s.detail;
  return {
    hasRelief,
    baseColor,
    detailColor,
    multicolor: s.style !== 'Solid' && baseColor !== detailColor,
    capBoundary: p.height * (1 - s.capHeight / 100),
    maximumTextHeight: maximumTextHeight(p),
    maximumSize: maximumSize(s, p),
  };
};

/** BalloonPatterns.swift:52-64 */
export const normalizePattern = (input: PatternSettings, p: BalloonParameters): PatternSettings => {
  const s = { ...input };
  s.bands = swiftMin(24, swiftMax(2, input.bands));
  s.repeats = swiftMin(24, swiftMax(1, input.repeats));
  s.rows = swiftMin(6, swiftMax(1, input.rows));
  s.size = swiftMin(maximumSize(s, p), swiftMax(3, Number.isFinite(input.size) ? input.size : 18));
  s.text = swiftCharacters(input.text)
    .slice(0, 64)
    .map((ch) => (isSwiftWhitespace(ch) ? ' ' : ch))
    .join('');
  s.textRepeats = swiftMin(24, swiftMax(1, input.textRepeats));
  s.textHeight = swiftMin(maximumTextHeight(p), swiftMax(3, Number.isFinite(input.textHeight) ? input.textHeight : 24));
  s.flightCompositionVersion = 3;
  s.reliefDepth = swiftMin(4, swiftMax(1.2, Number.isFinite(input.reliefDepth) ? input.reliefDepth : 2.4));
  s.capHeight = swiftMin(28, swiftMax(10, Number.isFinite(input.capHeight) ? input.capHeight : 18));
  return s;
};

/** BalloonPatterns.swift:100-121: settings saved before relief composition 3 get at least 2.4 mm relief. */
const decodePattern = (value: unknown): PatternSettings => {
  const c = container(value);
  const d = patternDefaults;
  const s: PatternSettings = {
    ...d,
    style: ifPresent.enum(c, 'style', BALLOON_PATTERNS) ?? d.style,
    bands: ifPresent.int(c, 'bands') ?? d.bands,
    repeats: ifPresent.int(c, 'repeats') ?? d.repeats,
    rows: ifPresent.int(c, 'rows') ?? d.rows,
    size: ifPresent.double(c, 'size') ?? d.size,
    base: ifPresent.enum(c, 'base', FILAMENT_COLORS) ?? d.base,
    detail: ifPresent.enum(c, 'detail', FILAMENT_COLORS) ?? d.detail,
    text: ifPresent.string(c, 'text') ?? d.text,
    textFont: ifPresent.enum(c, 'textFont', BALLOON_TEXT_FONTS) ?? d.textFont,
    textRepeats: ifPresent.int(c, 'textRepeats') ?? d.textRepeats,
    textHeight: ifPresent.double(c, 'textHeight') ?? d.textHeight,
  };
  s.reliefDepth = ifPresent.double(c, 'reliefDepth') ?? s.reliefDepth;
  if (ifPresent.int(c, 'flightCompositionVersion') === undefined) s.reliefDepth = swiftMax(2.4, s.reliefDepth);
  s.capHeight = ifPresent.double(c, 'capHeight') ?? s.capHeight;
  s.flightBody = ifPresent.enum(c, 'flightBody', FILAMENT_COLORS) ?? s.flightBody;
  s.flightCap = ifPresent.enum(c, 'flightCap', FILAMENT_COLORS) ?? s.flightCap;
  return s;
};

// --- PurgeSettings (synthesized Codable: every key required) ------------------

const purgeDefaults: PurgeSettings = Object.freeze({ layerHeight: 0.2, baseToDetail: 400, detailToBase: 400, multiplier: 1, density: 1.24 });

export const normalizePurge = (input: PurgeSettings): PurgeSettings => {
  const c = (v: number, lo: number, hi: number, fallback: number): number =>
    Number.isFinite(v) ? swiftMin(hi, swiftMax(lo, v)) : fallback;
  return {
    layerHeight: c(input.layerHeight, 0.08, 0.32, 0.2),
    baseToDetail: c(input.baseToDetail, 0, 1500, 400),
    detailToBase: c(input.detailToBase, 0, 1500, 400),
    multiplier: c(input.multiplier, 0, 2, 1),
    density: c(input.density, 0.5, 2, 1.24),
  };
};

const decodePurge = (value: unknown): PurgeSettings => {
  const c = container(value);
  return {
    layerHeight: required.double(c, 'layerHeight'),
    baseToDetail: required.double(c, 'baseToDetail'),
    detailToBase: required.double(c, 'detailToBase'),
    multiplier: required.double(c, 'multiplier'),
    density: required.double(c, 'density'),
  };
};

// --- Export naming (BalloonStudioApp.swift:113-114, 169-170) ------------------

export const balloonExportFormat = (pattern: PatternSettings): 'stl' | '3mf' => (pattern.style !== 'Solid' ? '3mf' : 'stl');

export const balloonExportFilename = (snapshot: BalloonSnapshot): string => {
  const p = normalizeBalloon(snapshot.parameters);
  const pattern = snapshot.pattern;
  if (balloonExportFormat(pattern) === 'stl') return balloonFilename(p);
  const suffix =
    pattern.style === 'Night Flight' ? '-night-flight' : pattern.style === 'Summit Cable Car' ? '-summit-cable-car' : '-pattern';
  // NSSavePanel appends the 3MF extension to the name with ".stl" replaced.
  return `${balloonFilename(p).split('.stl').join(suffix)}.3mf`;
};

export const balloonParameters: BalloonParameterApi = {
  defaults: classic,
  presets: Object.freeze({ classic, round, tall }),
  normalize: normalizeBalloon,
  codec: makeCodec(decodeBalloon),
  filename: balloonFilename,
  derived: balloonDerived,
  pattern: {
    defaults: patternDefaults,
    normalize: normalizePattern,
    codec: makeCodec(decodePattern),
    derived: patternDerived,
  },
  purge: { defaults: purgeDefaults, normalize: normalizePurge, codec: makeCodec(decodePurge) },
  exportFormat: balloonExportFormat,
  exportFilename: balloonExportFilename,
};
