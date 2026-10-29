// Ported from mac/Sources/BalloonStudio/CableClip.swift:19-88 (CableClipParameters), 94-232 (CableClip:
// every derived field, problem, note, pinch) and :502 (CableClipKit.fitsP2S) @ 03c9307. No meshes.

import type { CableClipNames, ClipParameterApi } from '../api';
import { CABLE_CLIP_MOUNTS, type CableClipDerived, type CableClipParameters, type Range } from '../types';
import { asin, cos, hypot, PI, sin } from '../swift/dmath';
import { container, ifPresent, lenientEnum, makeCodec } from './json';
import { printfFixed, printfG, swiftMax, swiftMax3, swiftMin } from './swiftCompat';

const defaults: CableClipParameters = Object.freeze({
  cableDiameter: 3.75,
  mount: 'nail',
  nailDiameter: 1.8,
  nailHeadDiameter: 3.3,
  nailHeadHeight: 0.7,
  nailGap: 3.0,
  plate: 2.0,
  length: 6.0,
  wall: 0.7,
  overlap: 0.5,
  flat: false,
});

const range = (lower: number, upper: number): Range => Object.freeze({ lower, upper });
const ranges = Object.freeze({
  cable: range(2.0, 6.0),
  nail: range(1.0, 4.0),
  head: range(2.0, 8.0),
  headHeight: range(0.3, 2.0),
  nailGap: range(0.4, 10.0),
  plate: range(1.2, 4.0),
  length: range(4.0, 12.0),
  wall: range(0.6, 1.2),
  overlap: range(0.3, 1.5),
});

export const normalizeClip = (input: CableClipParameters): CableClipParameters => {
  const clamp = (v: number, r: Range, fallback: number): number =>
    Number.isFinite(v) ? swiftMin(r.upper, swiftMax(r.lower, v)) : fallback;
  return {
    ...input,
    cableDiameter: clamp(input.cableDiameter, ranges.cable, 3.75),
    nailDiameter: clamp(input.nailDiameter, ranges.nail, 1.8),
    nailHeadDiameter: clamp(input.nailHeadDiameter, ranges.head, 3.3),
    nailHeadHeight: clamp(input.nailHeadHeight, ranges.headHeight, 0.7),
    nailGap: clamp(input.nailGap, ranges.nailGap, 3),
    plate: clamp(input.plate, ranges.plate, 2),
    length: clamp(input.length, ranges.length, 6),
    wall: clamp(input.wall, ranges.wall, 0.7),
    overlap: clamp(input.overlap, ranges.overlap, 0.5),
  };
};

export const clipNames = (p: CableClipParameters): CableClipNames => {
  const cableText = printfG(p.cableDiameter);
  return {
    cableText,
    displayName: `Cable clip · Ø ${cableText} mm`,
    filename: `Cable-Clip-${cableText}mm${p.mount === 'adhesive' ? '-adhesive' : ''}${p.flat ? '-flat' : ''}.stl`,
  };
};

/** CableClip.swift:42-54: an unknown mount falls back to the nail. */
const decode = (value: unknown): CableClipParameters => {
  const c = container(value);
  const d = defaults;
  return {
    cableDiameter: ifPresent.double(c, 'cableDiameter') ?? d.cableDiameter,
    mount: lenientEnum(c, 'mount', CABLE_CLIP_MOUNTS) ?? d.mount,
    nailDiameter: ifPresent.double(c, 'nailDiameter') ?? d.nailDiameter,
    nailHeadDiameter: ifPresent.double(c, 'nailHeadDiameter') ?? d.nailHeadDiameter,
    nailHeadHeight: ifPresent.double(c, 'nailHeadHeight') ?? d.nailHeadHeight,
    nailGap: ifPresent.double(c, 'nailGap') ?? d.nailGap,
    plate: ifPresent.double(c, 'plate') ?? d.plate,
    length: ifPresent.double(c, 'length') ?? d.length,
    wall: ifPresent.double(c, 'wall') ?? d.wall,
    overlap: ifPresent.double(c, 'overlap') ?? d.overlap,
    flat: ifPresent.bool(c, 'flat') ?? d.flat,
  };
};

// CableClip static constants (CableClip.swift:95-125)
const ARCH_PLAY = 0.1, HEAD_FLOOR = 0.6, RIDGE = 0.4, MIN_RIDGE = 0.6, FLARE = 1.1, ROOT_FILLET = 0.6;
const FLANGE_MARGIN = 0.7, END_MARGIN = 1.0, MIN_HALF_WIDTH = 1.5, SQUISH = 0.5, MIN_OPENING = 0.3;

type P2 = readonly [number, number];

/** CableClip.pinch (CableClip.swift:206-216) */
export const pinch = (tip: P2, wall: number, plate: number, edgeX: number, inner: number, fillet: number): number => {
  const path: P2[] = [[-inner + fillet, plate], [edgeX, plate], [edgeX, 0], [edgeX + 50, 0]];
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!, b = path[i + 1]!, dx = b[0] - a[0], dz = b[1] - a[1], l2 = swiftMax(dx * dx + dz * dz, 1e-12);
    const t = swiftMin(1, swiftMax(0, ((tip[0] - a[0]) * dx + (tip[1] - a[1]) * dz) / l2));
    best = swiftMin(best, hypot(tip[0] - (a[0] + t * dx), tip[1] - (a[1] + t * dz)));
  }
  return best - wall / 2;
};

/** `CableClip(p)` (CableClip.swift:143-180) with its computed properties. */
export const cableClip = (input: CableClipParameters): CableClipDerived => {
  const p = normalizeClip(input);
  const c = p.cableDiameter, nail = p.mount === 'nail';
  const radius = c / 2;
  const inner = c / 2 + ARCH_PLAY;
  const outer = inner + p.wall;
  const bore = p.nailDiameter + 0.3;
  const counterbore = swiftMax(p.nailHeadDiameter + 0.3, bore + 0.4);
  const thickness = nail ? swiftMax(p.plate, p.nailHeadHeight + HEAD_FLOOR) : p.plate;
  const plateThickness = thickness;
  const counterboreDepth = nail ? swiftMin(p.nailHeadHeight, thickness - HEAD_FLOOR) : 0;
  const halfWidth = swiftMax3(outer, MIN_HALF_WIDTH, nail ? counterbore / 2 + FLANGE_MARGIN : 0);
  const center = thickness + c / 2;
  const ex = swiftMax((RIDGE * c) / 2, MIN_RIDGE);
  const edgeX = ex;
  const fil = swiftMin(ROOT_FILLET, c / 4);
  const fillet = fil;
  const rm = (inner + outer) / 2, ctr = thickness + c / 2;
  const hw = swiftMax3(outer, MIN_HALF_WIDTH, nail ? counterbore / 2 + FLANGE_MARGIN : 0);
  let angle = -asin(swiftMin(p.overlap, inner - 0.2) / inner);
  while (angle < 0 && pinch([rm * cos(angle), ctr + rm * sin(angle)], p.wall, thickness, ex, inner, fil) < MIN_OPENING) {
    angle = swiftMin(0, angle + 0.005);
  }
  const tipAngle = angle;
  let flareEnd: number, nailY: number | null, plateEnd: number;
  if (nail) {
    const half = p.length / 2, slant = Math.sqrt(1 + FLARE * FLARE);
    flareEnd = half + FLARE * (hw - ex);
    const y = swiftMax(half + p.nailGap + counterbore / 2, half + (counterbore / 2 + FLANGE_MARGIN) * slant - FLARE * ex);
    nailY = y;
    plateEnd = y + counterbore / 2 + END_MARGIN;
  } else {
    flareEnd = p.length / 2;
    nailY = null;
    plateEnd = p.length / 2;
  }

  const mm = (value: number) => printfFixed(value, 1);
  const problem =
    p.mount === 'nail' && p.nailHeadDiameter < p.nailDiameter + 0.6
      ? `A ${mm(p.nailHeadDiameter)} mm head is too small for a ${mm(p.nailDiameter)} mm nail: it needs a head of ${mm(p.nailDiameter + 0.6)} mm or more to hold the plate.`
      : null;
  const overlap = -inner * sin(tipAngle);
  const notes: string[] = [];
  if (p.mount === 'nail' && p.nailHeadHeight > counterboreDepth + 0.001) {
    notes.push(
      `The nail head stands ${mm(p.nailHeadHeight - counterboreDepth)} mm proud of the plate under the cable; the sheath takes up about 0.3 mm of that.`,
    );
  }
  if (overlap < p.overlap - 0.01) {
    notes.push(`The overlap is limited to ${mm(overlap)} mm here, so the strap's tip stays ${mm(MIN_OPENING)} mm off the plate.`);
  }
  const length = p.length / 2 + plateEnd;
  const r = (inner + outer) / 2;
  const tip = { x: r * cos(tipAngle), z: center + r * sin(tipAngle) };
  const opening = pinch([tip.x, tip.z], p.wall, plateThickness, edgeX, inner, fillet);
  const padArea =
    (halfWidth + edgeX) * p.length +
    (p.mount === 'nail' ? 2 * halfWidth * (plateEnd - p.length / 2) - ((halfWidth - edgeX) * (flareEnd - p.length / 2)) / 2 : 0);
  const insertion = swiftMax(0, p.cableDiameter - SQUISH - opening);
  const leg = swiftMax(0, center - plateThickness - fillet), arc = ((PI - tipAngle) * (inner + outer)) / 2;
  const spring = leg + arc;
  return {
    radius,
    inner,
    outer,
    plateThickness,
    halfWidth,
    center,
    tipAngle,
    edgeX,
    bore,
    counterbore,
    counterboreDepth,
    flareEnd,
    nailY,
    plateEnd,
    fillet,
    problem,
    overlap,
    note: notes.length === 0 ? null : notes.join(' '),
    length,
    width: 2 * halfWidth,
    height: center + outer,
    tip,
    tipBottom: tip.z - p.wall / 2,
    opening,
    padArea,
    insertion,
    snapStrain: (1.5 * p.wall * insertion) / (spring * spring),
    fitsP2S: length + 16 <= 256,
  };
};

export const clipParameters: ClipParameterApi = {
  defaults,
  ranges,
  normalize: normalizeClip,
  codec: makeCodec(decode),
  filename: (p) => clipNames(p).filename,
  names: clipNames,
  clip: cableClip,
};
