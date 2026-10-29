// Ported from mac/Sources/BalloonStudio/RingGeometry.swift:3-112 @ 03c9307 (parameters only).

import type { RingDerived, RingParameterApi } from '../api';
import type { Range, RingParameters } from '../types';
import { PI } from '../swift/dmath';
import { container, ifPresent, makeCodec } from './json';
import { intTrunc, printfG, swiftMax, swiftMin } from './swiftCompat';

const defaults: RingParameters = Object.freeze({
  diameter: 240,
  bandWidth: 18,
  height: 6,
  cordClearance: 3,
  ledClearance: 0.4,
  channelDepth: 1.5,
  segmented: false,
  jointFit: 0.3,
  reflectedLED: false,
  stripWidth: 3.5,
  stripThickness: 3,
});
const large: RingParameters = Object.freeze({
  ...defaults,
  diameter: 450,
  bandWidth: 40,
  height: 12,
  cordClearance: 6,
  ledClearance: 0.5,
  segmented: true,
  reflectedLED: true,
  stripWidth: 8,
});
const solid: RingParameters = Object.freeze({ ...large, segmented: false });

const outerLip = 2.0;
const range = (lower: number, upper: number): Range => ({ lower, upper });

const diameterRange = (p: RingParameters): Range => (p.segmented ? range(300, 600) : range(140, 600));
const heightRange = (p: RingParameters): Range => (p.segmented || p.reflectedLED ? range(8, 16) : range(4, 10));
const cordRange = (p: RingParameters): Range => (p.segmented || p.reflectedLED ? range(4, 8) : range(2, 5));
const maximumBandWidth = (p: RingParameters): number => (p.reflectedLED ? 60 : p.segmented ? 36 : 28);
const channelWidth = (p: RingParameters): number => p.stripWidth + p.ledClearance;
const maximumChannelDepth = (p: RingParameters): number => swiftMin(3, p.height - 3);
const innerRadius = (p: RingParameters): number => p.diameter / 2 - p.bandWidth;
const channelOuterRadius = (p: RingParameters): number => p.diameter / 2 - outerLip;
const channelInnerRadius = (p: RingParameters): number => channelOuterRadius(p) - channelWidth(p);
const ledWallRadius = (p: RingParameters): number => p.diameter / 2 - 2.4;
const ledShelfZ = (p: RingParameters): number => p.height + 1;
const ledShelfRadius = (p: RingParameters): number => ledWallRadius(p) - p.stripThickness - 0.5;
const reflectorRise = (p: RingParameters): number => channelWidth(p) + 2;
const reflectorToeRadius = (p: RingParameters): number => ledWallRadius(p) - p.stripThickness - 2;
const reflectorInnerRadius = (p: RingParameters): number => reflectorToeRadius(p) - reflectorRise(p);
const flangeOuterRadius = (p: RingParameters): number => (p.reflectedLED ? reflectorInnerRadius(p) - 2 : channelInnerRadius(p));
const holeRadius = (p: RingParameters): number => (innerRadius(p) + flangeOuterRadius(p)) / 2;
const channelRadius = (p: RingParameters): number => (channelInnerRadius(p) + channelOuterRadius(p)) / 2;
const floorThickness = (p: RingParameters): number => p.height - p.channelDepth;
const totalHeight = (p: RingParameters): number => p.height + (p.reflectedLED ? reflectorRise(p) : 0);

const minimumBandWidth = (p: RingParameters): number => {
  if (p.reflectedLED) return Math.ceil(p.diameter / 2 - flangeOuterRadius(p) + 4 + Math.sqrt(2) * (p.cordClearance + 1.6));
  return p.segmented
    ? swiftMax(24, Math.ceil(channelWidth(p) + 6 + Math.sqrt(2) * (p.cordClearance + 1.6)))
    : Math.ceil(channelWidth(p) + 6 + Math.sqrt(2) * p.cordClearance);
};

const outerProfile = (p: RingParameters): { radius: number; z: number }[] => {
  const pt = (radius: number, z: number) => ({ radius, z });
  if (p.reflectedLED) {
    const t = totalHeight(p), wall = ledWallRadius(p), shelf = ledShelfZ(p), flange = flangeOuterRadius(p);
    return [
      pt(flange, 0), pt(p.diameter / 2, 0), pt(p.diameter / 2, t),
      pt(wall, t), pt(wall, shelf + channelWidth(p)),
      pt(wall, shelf), pt(ledShelfRadius(p), shelf), pt(ledShelfRadius(p), p.height),
      pt(reflectorToeRadius(p), p.height), pt(reflectorInnerRadius(p), t),
      pt(flange, t), pt(flange, p.height),
    ];
  }
  return [
    pt(flangeOuterRadius(p), 0), pt(p.diameter / 2, 0), pt(p.diameter / 2, p.height), pt(channelOuterRadius(p), p.height),
    pt(channelOuterRadius(p), floorThickness(p)), pt(channelInnerRadius(p), floorThickness(p)), pt(flangeOuterRadius(p), p.height),
  ];
};

export const ringFilename = (p: RingParameters): string => {
  if (p.reflectedLED) return `Mobile-Ring-${intTrunc(p.diameter)}mm-${printfG(p.stripWidth)}mm-uplight-${p.segmented ? 'kit.zip' : 'solid.stl'}`;
  return p.segmented ? `Mobile-Ring-${intTrunc(p.diameter)}mm-6-section-kit.zip` : `Mobile-Ring-${intTrunc(p.diameter)}mm-3-balloons.stl`;
};

const derived = (p: RingParameters): RingDerived => ({
  diameterRange: diameterRange(p),
  heightRange: heightRange(p),
  cordRange: cordRange(p),
  maximumBandWidth: maximumBandWidth(p),
  continuousCords: p.segmented,
  fitsP2S: p.diameter + 16 <= 256 && totalHeight(p) <= 256,
  channelWidth: channelWidth(p),
  minimumBandWidth: minimumBandWidth(p),
  maximumChannelDepth: maximumChannelDepth(p),
  innerRadius: innerRadius(p),
  channelOuterRadius: channelOuterRadius(p),
  channelInnerRadius: channelInnerRadius(p),
  flangeOuterRadius: flangeOuterRadius(p),
  holeRadius: holeRadius(p),
  channelRadius: channelRadius(p),
  stripPathLength: 2 * PI * (p.reflectedLED ? ledWallRadius(p) : channelRadius(p)),
  balloonSpacing: Math.sqrt(3) * holeRadius(p),
  floorThickness: floorThickness(p),
  ledWallRadius: ledWallRadius(p),
  ledShelfZ: ledShelfZ(p),
  ledShelfRadius: ledShelfRadius(p),
  reflectorRise: reflectorRise(p),
  reflectorToeRadius: reflectorToeRadius(p),
  reflectorInnerRadius: reflectorInnerRadius(p),
  totalHeight: totalHeight(p),
  outerProfile: outerProfile(p),
  filename: ringFilename(p),
});

/** RingGeometry.swift:66-80. Note the clamp order: `max(low, min(high, value))`. */
export const normalizeRing = (input: RingParameters): RingParameters => {
  const clamp = (value: number, low: number, high: number, fallback: number): number =>
    swiftMax(low, swiftMin(high, Number.isFinite(value) ? value : fallback));
  const p = { ...input };
  p.stripWidth = clamp(input.stripWidth, 3.5, 12, p.reflectedLED ? 8 : 3.5);
  p.stripThickness = clamp(input.stripThickness, 1, 6, 3);
  p.diameter = clamp(input.diameter, diameterRange(p).lower, diameterRange(p).upper, input.segmented ? 450 : 240);
  p.height = clamp(input.height, heightRange(p).lower, heightRange(p).upper, p.segmented || p.reflectedLED ? 12 : 6);
  p.cordClearance = clamp(input.cordClearance, cordRange(p).lower, cordRange(p).upper, p.segmented || p.reflectedLED ? 6 : 3);
  p.ledClearance = clamp(input.ledClearance, 0.2, 1, 0.4);
  p.bandWidth = clamp(input.bandWidth, minimumBandWidth(p), maximumBandWidth(p), p.reflectedLED ? 40 : input.segmented ? 24 : 18);
  p.channelDepth = clamp(input.channelDepth, 0.6, maximumChannelDepth(p), 1.5);
  p.jointFit = clamp(input.jointFit, 0.2, 0.6, 0.3);
  return p;
};

/** RingGeometry.swift:97-110 */
const decode = (value: unknown): RingParameters => {
  const c = container(value);
  const d = defaults;
  return {
    diameter: ifPresent.double(c, 'diameter') ?? d.diameter,
    bandWidth: ifPresent.double(c, 'bandWidth') ?? d.bandWidth,
    height: ifPresent.double(c, 'height') ?? d.height,
    cordClearance: ifPresent.double(c, 'cordClearance') ?? d.cordClearance,
    ledClearance: ifPresent.double(c, 'ledClearance') ?? d.ledClearance,
    channelDepth: ifPresent.double(c, 'channelDepth') ?? d.channelDepth,
    segmented: ifPresent.bool(c, 'segmented') ?? false,
    jointFit: ifPresent.double(c, 'jointFit') ?? 0.3,
    reflectedLED: ifPresent.bool(c, 'reflectedLED') ?? false,
    stripWidth: ifPresent.double(c, 'stripWidth') ?? 3.5,
    stripThickness: ifPresent.double(c, 'stripThickness') ?? 3,
  };
};

export const ringParameters: RingParameterApi = {
  defaults,
  presets: Object.freeze({ large, solid }),
  outerLip,
  normalize: normalizeRing,
  codec: makeCodec(decode),
  filename: ringFilename,
  derived,
};
