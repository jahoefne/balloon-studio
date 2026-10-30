// The real core's parameter half (WP-K9): normalizers, codecs, filenames and derived values of the
// ported modules, imported on the main thread via `#core/parameters`. The codecs read through
// `JSONKeyedContainer`, so a text decodes as JSONDecoder decodes it, not as JSON.parse does.

import type { BalloonParameterApi, BasketParameterApi, ClipParameterApi, CoreParameterApi, FigureParameterApi, RingParameterApi } from '../api';
import * as balloonModel from '../balloon/balloonParameters';
import { maximumBytes, maximumTriangles } from '../balloon/balloonStl';
import { actualDepth, basketDefaults, basketFilename, floorThickness, holeCenter, normalizedBasket } from '../basket/basketGeometry';
import { CableClip, cableRange, cableText, defaultParameters, displayName, filename as clipFilename, headHeightRange, headRange, lengthRange, nailGapRange, nailRange, normalized as normalizedClip, overlapRange, plateRange, toJSON as clipToJSON, wallRange } from '../clip/cableClip';
import { keyedCodec, lenientEnumeration, settingsCodec } from '../codec';
import { encodeFigureParameters, figureParameterApi } from '../figures/figureGeometry';
import { encodeRingParameters, filename as ringFilename, normalized as normalizedRing, OUTER_LIP, RING_DEFAULTS, RING_LARGE, RING_SOLID, ringDerived } from '../ring/ringGeometry';
import type { JSONKeyedContainer } from '../swift/json';
import { rounded } from '../swift/rounding';
import { balloonExportFilename, balloonExportFormat, balloonParameters as stubBalloon } from '../stub/balloon';
import { cloudParameters } from '../stub/cloud';
import { lampSettings } from '../stub/lampSettings';
import { BASKET_STYLES, CABLE_CLIP_MOUNTS, FIGURE_STYLES, FIGURE_SURFACES, type BasketParameters, type CableClipDerived, type CableClipParameters, type FigureParameters, type RingParameters } from '../types';

const balloon: BalloonParameterApi = {
  defaults: balloonModel.classic,
  presets: Object.freeze({ classic: balloonModel.classic, round: balloonModel.round, tall: balloonModel.tall }),
  normalize: balloonModel.normalized,
  codec: settingsCodec(balloonModel.fromJSON, balloonModel.fromValue, balloonModel.toJSON),
  filename: balloonModel.filename,
  derived: (p) => ({
    maximumNeckDiameter: balloonModel.maximumNeckDiameter(p),
    maximumNeckHeight: balloonModel.maximumNeckHeight(p),
    hasStringHoles: balloonModel.hasStringHoles(p),
    loopHeight: balloonModel.loopHeight(p),
    totalHeight: balloonModel.totalHeight(p),
    maximumHeight: balloonModel.maximumHeight(p),
    neckWallThickness: balloonModel.neckWallThickness(p),
    minimumNeckDiameter: balloonModel.minimumNeckDiameter(p),
    minimumNeckHeight: balloonModel.minimumNeckHeight(p),
    fitsPrinter: balloonModel.fitsPrinter(p),
    fitsWithBrim: balloonModel.fitsWithBrim(p),
    openingDiameter: balloonModel.openingDiameter(p),
    filename: balloonModel.filename(p),
  }),
  // TODO(WP-K3): PatternSettings and PurgeSettings from core/patterns.
  pattern: stubBalloon.pattern,
  purge: stubBalloon.purge,
  exportFormat: balloonExportFormat,
  exportFilename: balloonExportFilename,
};

/** Synthesized Codable (BasketGeometry.swift:19): every key is required, in declaration order. */
const decodeBasket = (c: JSONKeyedContainer): BasketParameters => ({
  style: c.enumeration('style', BASKET_STYLES),
  width: c.double('width'),
  depth: c.double('depth'),
  height: c.double('height'),
  wallThickness: c.double('wallThickness'),
  cordClearance: c.double('cordClearance'),
  texture: c.double('texture'),
});

const basket: BasketParameterApi = {
  defaults: Object.freeze(basketDefaults()),
  normalize: normalizedBasket,
  codec: keyedCodec(decodeBasket),
  filename: basketFilename,
  derived: (p) => ({ actualDepth: actualDepth(p), floorThickness: floorThickness(p), holeCenter: holeCenter(p), filename: basketFilename(p) }),
  // BasketEditor.swift:50-56
  match: (p, balloonParameters) => ({
    ...p,
    width: rounded(balloonParameters.diameter * 0.35),
    depth: rounded(balloonParameters.diameter * 0.27),
    height: rounded(balloonParameters.height * 0.19),
  }),
};

/** RingGeometry.swift:97-111 */
const decodeRing = (c: JSONKeyedContainer): RingParameters => ({
  diameter: c.doubleIfPresent('diameter') ?? RING_DEFAULTS.diameter,
  bandWidth: c.doubleIfPresent('bandWidth') ?? RING_DEFAULTS.bandWidth,
  height: c.doubleIfPresent('height') ?? RING_DEFAULTS.height,
  cordClearance: c.doubleIfPresent('cordClearance') ?? RING_DEFAULTS.cordClearance,
  ledClearance: c.doubleIfPresent('ledClearance') ?? RING_DEFAULTS.ledClearance,
  channelDepth: c.doubleIfPresent('channelDepth') ?? RING_DEFAULTS.channelDepth,
  segmented: c.boolIfPresent('segmented') ?? false,
  jointFit: c.doubleIfPresent('jointFit') ?? 0.3,
  reflectedLED: c.boolIfPresent('reflectedLED') ?? false,
  stripWidth: c.doubleIfPresent('stripWidth') ?? 3.5,
  stripThickness: c.doubleIfPresent('stripThickness') ?? 3,
});

const ring: RingParameterApi = {
  defaults: RING_DEFAULTS,
  presets: Object.freeze({ large: RING_LARGE, solid: RING_SOLID }),
  outerLip: OUTER_LIP,
  normalize: normalizedRing,
  codec: keyedCodec(decodeRing, encodeRingParameters),
  filename: ringFilename,
  derived: ringDerived,
};

/** FigureGeometry.swift:192-204: unknown style or surface names fall back. */
const decodeFigure = (c: JSONKeyedContainer): FigureParameters => {
  const d = figureParameterApi.defaults;
  return {
    style: lenientEnumeration(c, 'style', FIGURE_STYLES) ?? d.style,
    height: c.doubleIfPresent('height') ?? d.height,
    surface: lenientEnumeration(c, 'surface', FIGURE_SURFACES) ?? d.surface,
    edge: c.doubleIfPresent('edge') ?? d.edge,
    dome: c.doubleIfPresent('dome') ?? d.dome,
    doubleSided: c.boolIfPresent('doubleSided') ?? d.doubleSided,
    holeDiameter: c.doubleIfPresent('holeDiameter') ?? d.holeDiameter,
    holeMargin: c.doubleIfPresent('holeMargin') ?? d.holeMargin,
    chainHole: c.boolIfPresent('chainHole') ?? d.chainHole,
  };
};

const figure: FigureParameterApi = { ...figureParameterApi, codec: keyedCodec(decodeFigure, encodeFigureParameters) };

const clipDefaults: CableClipParameters = Object.freeze(defaultParameters());

/** CableClip.swift:42-56: an unknown or mistyped mount falls back to the nail. */
const decodeClip = (c: JSONKeyedContainer): CableClipParameters => {
  const d = clipDefaults;
  return {
    cableDiameter: c.doubleIfPresent('cableDiameter') ?? d.cableDiameter,
    mount: lenientEnumeration(c, 'mount', CABLE_CLIP_MOUNTS) ?? d.mount,
    nailDiameter: c.doubleIfPresent('nailDiameter') ?? d.nailDiameter,
    nailHeadDiameter: c.doubleIfPresent('nailHeadDiameter') ?? d.nailHeadDiameter,
    nailHeadHeight: c.doubleIfPresent('nailHeadHeight') ?? d.nailHeadHeight,
    nailGap: c.doubleIfPresent('nailGap') ?? d.nailGap,
    plate: c.doubleIfPresent('plate') ?? d.plate,
    length: c.doubleIfPresent('length') ?? d.length,
    wall: c.doubleIfPresent('wall') ?? d.wall,
    overlap: c.doubleIfPresent('overlap') ?? d.overlap,
    flat: c.boolIfPresent('flat') ?? d.flat,
  };
};

/** Every field the contract lists; `CableClip` computes most of them on demand. */
export const clipDerived = (c: CableClip): CableClipDerived => ({
  radius: c.radius,
  inner: c.inner,
  outer: c.outer,
  plateThickness: c.plateThickness,
  halfWidth: c.halfWidth,
  center: c.center,
  tipAngle: c.tipAngle,
  edgeX: c.edgeX,
  bore: c.bore,
  counterbore: c.counterbore,
  counterboreDepth: c.counterboreDepth,
  flareEnd: c.flareEnd,
  nailY: c.nailY,
  plateEnd: c.plateEnd,
  fillet: c.fillet,
  problem: c.problem,
  overlap: c.overlap,
  note: c.note,
  length: c.length,
  width: c.width,
  height: c.height,
  tip: c.tip,
  tipBottom: c.tipBottom,
  opening: c.opening,
  padArea: c.padArea,
  insertion: c.insertion,
  snapStrain: c.snapStrain,
  // CableClipKit.fitsP2S (CableClip.swift:502), without generating the kit's mesh.
  fitsP2S: c.length + 16 <= 256,
});

const clip: ClipParameterApi = {
  defaults: clipDefaults,
  ranges: Object.freeze({
    cable: cableRange,
    nail: nailRange,
    head: headRange,
    headHeight: headHeightRange,
    nailGap: nailGapRange,
    plate: plateRange,
    length: lengthRange,
    wall: wallRange,
    overlap: overlapRange,
  }),
  normalize: normalizedClip,
  codec: keyedCodec(decodeClip, clipToJSON),
  filename: clipFilename,
  names: (p) => ({ cableText: cableText(p), displayName: displayName(p), filename: clipFilename(p) }),
  clip: (p) => clipDerived(new CableClip(p)),
};

export const core: CoreParameterApi = {
  implementation: 'real',
  balloon,
  basket,
  ring,
  // TODO(WP-K4): core/lamp, once K4c is on main (LampSurface still throws).
  cloud: cloudParameters,
  figure,
  clip,
  stl: { maximumBytes, maximumTriangles },
  // TODO(WP-K4): LampSettingsFile from core/lamp/lampSettingsFile.ts.
  lampSettings,
};
