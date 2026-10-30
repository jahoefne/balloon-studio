// The real core's parameter half (WP-K9): normalizers, codecs, filenames and derived values of the
// ported modules, imported on the main thread via `#core/parameters`. The codecs read through
// `JSONKeyedContainer`, so a text decodes as JSONDecoder decodes it, not as JSON.parse does.

import { CoreFailure, LAMP_SETTINGS_ERROR, type BalloonParameterApi, type BasketParameterApi, type ClipParameterApi, type CloudDerived, type CloudParameterApi, type CoreParameterApi, type FigureParameterApi, type LampProfileRef, type LampSettingsApi, type RingParameterApi } from '../api';
import * as balloonModel from '../balloon/balloonParameters';
import { maximumBytes, maximumTriangles } from '../balloon/balloonStl';
import { actualDepth, basketDefaults, basketFilename, floorThickness, holeCenter, normalizedBasket } from '../basket/basketGeometry';
import { CableClip, cableRange, cableText, defaultParameters, displayName, filename as clipFilename, headHeightRange, headRange, lengthRange, nailGapRange, nailRange, normalized as normalizedClip, overlapRange, plateRange, toJSON as clipToJSON, wallRange } from '../clip/cableClip';
import { keyedCodec, lenientEnumeration, settingsCodec } from '../codec';
import { encodeFigureParameters, figureParameterApi } from '../figures/figureGeometry';
import { CableClamp } from '../lamp/cableClamp';
import * as lamp from '../lamp/cloudGeometry';
import { NailInsert } from '../lamp/nailInsert';
import { sunProfile, wallLampDefaults } from '../lamp/sunGeometry';
import { encodeRingParameters, filename as ringFilename, normalized as normalizedRing, OUTER_LIP, RING_DEFAULTS, RING_LARGE, RING_SOLID, ringDerived } from '../ring/ringGeometry';
import { JSONKeyedContainer } from '../swift/json';
import { rounded } from '../swift/rounding';
import { balloonExportFilename, balloonExportFormat, balloonParameters as stubBalloon } from '../stub/balloon';
import { BASKET_STYLES, CABLE_CLIP_MOUNTS, CABLE_SIDES, CLOUD_STYLES, FIGURE_STYLES, FIGURE_SURFACES, LAMP_SURFACES, SUN_STYLES, WALL_LAMP_KINDS, type BasketParameters, type CableClipDerived, type CableClipParameters, type CloudParameters, type FigureParameters, type NailInsertInfo, type RingParameters } from '../types';

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

/** CloudGeometry.swift:104-133, fields in its order. A sun saved with a former design opens as the first sun. */
const decodeCloud = (c: JSONKeyedContainer): CloudParameters => {
  const p = lamp.cloudParameters();
  p.kind = c.enumerationIfPresent('kind', WALL_LAMP_KINDS) ?? 'cloud';
  p.width = p.kind === 'sun' ? 200 : p.width;
  p.style = c.enumerationIfPresent('style', CLOUD_STYLES) ?? p.style;
  p.sunStyle = lenientEnumeration(c, 'sunStyle', SUN_STYLES) ?? p.sunStyle;
  p.mirrored = c.boolIfPresent('mirrored') ?? p.mirrored;
  p.width = c.doubleIfPresent('width') ?? p.width;
  p.depth = c.doubleIfPresent('depth') ?? p.depth;
  p.diffuserThickness = c.doubleIfPresent('diffuserThickness') ?? p.diffuserThickness;
  p.surface = c.enumerationIfPresent('surface', LAMP_SURFACES) ?? 'flat';
  p.surfaceDepth = c.doubleIfPresent('surfaceDepth') ?? p.surfaceDepth;
  p.stripWidth = c.doubleIfPresent('stripWidth') ?? p.stripWidth;
  p.stripThickness = c.doubleIfPresent('stripThickness') ?? p.stripThickness;
  p.stripCutLength = c.doubleIfPresent('stripCutLength') ?? p.stripCutLength;
  p.ledRowSpacing = c.doubleIfPresent('ledRowSpacing') ?? p.ledRowSpacing;
  p.clipFit = c.doubleIfPresent('clipFit') ?? p.clipFit;
  p.cableDiameter = c.doubleIfPresent('cableDiameter') ?? p.cableDiameter;
  p.cableSide = c.enumerationIfPresent('cableSide', CABLE_SIDES) ?? p.cableSide;
  p.secondCableSide = c.enumerationIfPresent('secondCableSide', CABLE_SIDES) ?? null;
  p.thirdCableSide = c.enumerationIfPresent('thirdCableSide', CABLE_SIDES) ?? null;
  p.fourthCableSide = c.enumerationIfPresent('fourthCableSide', CABLE_SIDES) ?? null;
  p.strainRelief = c.boolIfPresent('strainRelief') ?? p.strainRelief;
  p.nailHead = c.doubleIfPresent('nailHead') ?? p.nailHead;
  p.nailShaft = c.doubleIfPresent('nailShaft') ?? p.nailShaft;
  p.nailInsert = c.boolIfPresent('nailInsert') ?? p.nailInsert;
  p.nailDiameter = c.doubleIfPresent('nailDiameter') ?? p.nailDiameter;
  p.nailHeadDiameter = c.doubleIfPresent('nailHeadDiameter') ?? p.nailHeadDiameter;
  return p;
};

const cloudDerived = (p: CloudParameters): CloudDerived => ({
  cableSides: lamp.cableSides(p),
  height: lamp.height(p),
  reliefDepth: lamp.reliefDepth(p),
  maximumSurfaceDepth: lamp.maximumSurfaceDepth(p),
  totalDepth: lamp.totalDepth(p),
  minimumWidth: lamp.minimumWidth(p),
  layoutHeightBasis: lamp.layoutHeightBasis(p),
  verticalScale: lamp.verticalScale(p),
  compactBlend: lamp.compactBlend(p),
  coreLowY: lamp.coreLowY(p),
  coreHighY: lamp.coreHighY(p),
  coreHalfWidth: lamp.coreHalfWidth(p),
  cableStartY: lamp.cableStartY(p),
  cableBossTop: lamp.cableBossTop(p),
  nailCenterY: lamp.nailCenterY(p),
  ledCenterY: lamp.ledCenterY(p),
  ledLength: lamp.ledLength(p),
  ledChannelWidth: lamp.ledChannelWidth(p),
  cableClearance: lamp.cableClearance(p),
  fitsP2S: lamp.fitsP2S(p),
  displayName: lamp.displayName(p),
  frontFilename: lamp.frontFilename(p),
  filename: lamp.filename(p),
});

/** The fields of a `NailInsert` the editor reads. */
export const nailInsertInfo = (insert: NailInsert): NailInsertInfo => ({
  halfWidth: insert.halfWidth,
  tipHalfWidth: insert.tipHalfWidth,
  height: insert.height,
  slotHalfWidth: insert.slotHalfWidth,
  mouthHalfWidth: insert.mouthHalfWidth,
  cheek: insert.cheek,
  top: insert.top,
  slotCenter: insert.slotCenter,
  nailY: insert.nailY,
  nearestHead: insert.nearestHead,
  headRoom: insert.headRoom,
});

const profileOf = (ref: LampProfileRef): lamp.CloudProfile => {
  if (ref.kind === 'sun') return sunProfile(ref.sunStyle);
  const profile = lamp.cloudStyleProfile(ref.style);
  return ref.mirrored ? profile.mirrored : profile;
};

const cloud: CloudParameterApi = {
  defaults: wallLampDefaults,
  normalize: lamp.normalized,
  codec: keyedCodec(decodeCloud, lamp.encodeCloudParameters),
  filename: lamp.filename,
  derived: cloudDerived,
  constants: lamp.CloudConstants,
  withCableSides: lamp.withCableSides,
  selectCableSide: lamp.selectCableSide,
  setCableOutletCount: lamp.setCableOutletCount,
  cableConfigurations: lamp.cableConfigurations,
  nailInsertProblem: (p) => NailInsert.problem(p),
  nailInsert: (p) => {
    const insert = NailInsert.create(p);
    return insert === null ? null : nailInsertInfo(insert);
  },
  clampFits: (p) => CableClamp.create(p) !== null,
  clampMinimumWidth: (p) => CableClamp.minimumWidth(p),
  profileExtent: (ref) => {
    const { lowY, highY } = profileOf(ref);
    return { lowY, highY };
  },
  radius: (angle, ref, options) => lamp.CloudGenerator.radius(angle, options?.inset ?? 0, options?.width ?? 1, options?.verticalScale ?? 1, profileOf(ref)),
};

/** `LampSettingsFile.decode`: an opened file must identify a lamp before the defaults may fill in the rest. */
const lampSettings: LampSettingsApi = {
  decode(text) {
    try {
      const c = JSONKeyedContainer.fromJSON(text);
      c.double('width');
      c.double('depth');
      c.double('diffuserThickness');
      return lamp.normalized(decodeCloud(c));
    } catch {
      throw new CoreFailure('invalid-lamp-settings', LAMP_SETTINGS_ERROR);
    }
  },
};

export const core: CoreParameterApi = {
  implementation: 'real',
  balloon,
  basket,
  ring,
  cloud,
  figure,
  clip,
  stl: { maximumBytes, maximumTriangles },
  lampSettings,
};
