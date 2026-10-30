// Ported from mac/Sources/BalloonStudio/BalloonGeometry.swift @ cbda68d (lines 212-380:
// BalloonGenerator).
import { BalloonMesh, type IntRange } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import { SurfaceQuery } from '../geometry/surfaceQuery';
import { atan, cos, hypot, PI, sin } from '../swift/dmath';
import { swiftMax, swiftMin } from '../swift/minmax';
import type { BalloonParameters } from '../types';
import { hasStringHoles, neckWallThickness, normalized } from './balloonParameters';
import * as CeilingLoop from './ceilingLoop';
import * as StringHoles from './stringHoles';

export type Quality = 'preview' | 'export';

type Pair = readonly [number, number];

function bezier(a: Pair, b: Pair, c: Pair, d: Pair, t: number): Pair {
  const s = 1 - t;
  return [
    s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0],
    s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1],
  ];
}

function smooth(t: number): number {
  const s = swiftMin(1, swiftMax(0, t));
  return s * s * (3 - 2 * s);
}

/**
 * Swift `BalloonGenerator.generate(_:quality:)`. `isCancelled` replaces `Task.isCancelled` and is
 * polled at the same place, once per ring of the hollow inset; a cancelled run returns the same
 * empty mesh.
 */
export function generate(input: BalloonParameters, quality: Quality = 'preview', isCancelled?: () => boolean): BalloonMesh {
  const p = normalized(input);
  const radius = p.diameter / 2;
  const neck = p.neckDiameter / 2;
  const shoulderZ = (p.height * p.shoulder) / 100;
  const samples = quality === 'export' ? 20 : 12;
  const baseAngular = p.panels * samples;
  const allowance = 0.04 + ((radius * p.panelDepth) / 100) * (1 - cos(PI / samples));
  const holes = hasStringHoles(p);
  const neckWall = neckWallThickness(p);
  const layout = holes ? StringHoles.layout(baseAngular, p.cordClearance, () => (p.hollow ? neck - neckWall - allowance : neck)) : undefined;
  let angles: number[];
  if (layout !== undefined) angles = layout.angles;
  else {
    angles = [];
    for (let i = 0; i < baseAngular; i++) angles.push((2 * PI * i) / baseAngular);
  }
  const angular = angles.length;
  const lowerSteps = quality === 'export' ? 160 : 80;
  const upperSteps = quality === 'export' ? 140 : 70;
  let profile: { r: number; z: number }[] = [
    { r: neck, z: 0 },
    { r: neck, z: p.neckHeight / 2 },
    { r: neck, z: p.neckHeight },
  ];
  if (holes) {
    const mid = p.neckHeight / 2;
    const half = p.cordClearance / Math.sqrt(2);
    profile = [
      { r: neck, z: 0 },
      { r: neck, z: mid - half },
      { r: neck, z: mid },
      { r: neck, z: mid + half },
      { r: neck, z: p.neckHeight },
    ];
  }
  // The same two lower Bezier curves used by the original Blender model.
  for (let i = 1; i <= lowerSteps; i++) {
    const t = i / lowerSteps;
    let rz: Pair;
    if (t <= 0.25) {
      rz = bezier([16, 6], [16, 17], [26, 28], [33, 38], t * 4);
    } else {
      rz = bezier([33, 38], [56, 71], [90, 94], [90, 142], (t - 0.25) / 0.75);
    }
    profile.push({ r: neck + ((rz[0] - 16) / 74) * (radius - neck), z: p.neckHeight + ((rz[1] - 6) / 136) * (shoulderZ - p.neckHeight) });
  }
  for (let i = 1; i < upperSteps; i++) {
    const rz = bezier([radius, shoulderZ], [radius, shoulderZ + ((p.height - shoulderZ) * 42) / 78], [(radius * 48) / 90, p.height], [0, p.height], i / upperSteps);
    profile.push({ r: rz[0], z: rz[1] });
  }
  const vertices: Point3[] = [];
  let maxSlope = 0.0;
  for (let i = 0; i < profile.length; i++) {
    const ring = profile[i] as { r: number; z: number };
    // Measure the meridian profile, independent of the angular resampling
    // used to join the perforated neck to the fluted envelope.
    if (i > 0) {
      const before = profile[i - 1] as { r: number; z: number };
      maxSlope = swiftMax(maxSlope, (ring.r - before.r) / (ring.z - before.z));
    }
    const fade = smooth((ring.z - p.neckHeight) / (((shoulderZ - p.neckHeight) * 32) / 136));
    const crown = smooth(ring.r / ((radius * 22) / 90));
    const blend = holes ? smooth((ring.z - p.neckHeight) / swiftMax(12, p.height * 0.1)) : 0;
    for (let j = 0; j < angular; j++) {
      const angle = (angles[j] as number) * (1 - blend) + ((2 * PI * j) / angular) * blend;
      const r = ring.r * (1 - (p.panelDepth / 200) * fade * crown * (1 - cos(p.panels * angle)));
      vertices.push({ x: r * cos(angle), y: r * sin(angle), z: ring.z });
    }
  }
  const triangles: Triangle[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < angular; j++) {
      const k = (j + 1) % angular;
      const a = i * angular + j;
      const b = i * angular + k;
      const c = (i + 1) * angular + k;
      const d = (i + 1) * angular + j;
      triangles.push({ a, b, c });
      triangles.push({ a, b: c, c: d });
    }
  }
  const top = vertices.length;
  vertices.push({ x: 0, y: 0, z: p.height });
  const last = (profile.length - 1) * angular;
  for (let j = 0; j < angular; j++) {
    const k = (j + 1) % angular;
    triangles.push({ a: last + j, b: last + k, c: top });
  }
  let holePairs: (readonly [StringHoles.Patch, StringHoles.Patch])[] = [];
  let innerRange: IntRange | undefined;
  if (!p.hollow) {
    const bottom = vertices.length;
    vertices.push({ x: 0, y: 0, z: 0 });
    for (let j = 0; j < angular; j++) {
      triangles.push({ a: bottom, b: (j + 1) % angular, c: j });
    }
  } else {
    const surface = new SurfaceQuery(vertices, triangles);
    const insideStart = vertices.length;
    // Extra clearance covers chord error when triangulating the offset.
    // A distance-based inset also rounds tight internal grooves safely.
    const inset = p.wallThickness + allowance;
    const crownInset = p.hangingLoop ? swiftMax(p.hangingCrownThickness, inset) : inset;
    const insideHeight = p.height - crownInset;
    // Blend the reinforced crown across the whole attachment pad.
    const reinforcementDepth = p.hangingLoop ? swiftMax(24, 2 * CeilingLoop.padRadius(p)) : 24;
    let outerRow = 0;
    for (let row = 0; row < profile.length; row++) {
      if (isCancelled?.()) {
        // Cancelled previews are discarded by the caller.
        return new BalloonMesh([], [], 0);
      }
      const ring = profile[row] as { r: number; z: number };
      const z = holes
        ? ring.z <= p.neckHeight
          ? ring.z
          : p.neckHeight + ((ring.z - p.neckHeight) * (insideHeight - p.neckHeight)) / (p.height - p.neckHeight)
        : (ring.z * insideHeight) / p.height;
      const crownReinforcement = (crownInset - inset) * smooth((z - (p.height - reinforcementDepth)) / (reinforcementDepth - crownInset));
      const localInset = inset + (neckWall - p.wallThickness) * (1 - smooth((z - p.neckHeight) / 10)) + crownReinforcement;
      while (outerRow + 1 < profile.length - 1 && (profile[outerRow + 1] as { z: number }).z < z) outerRow += 1;
      const lowerZ = (profile[outerRow] as { z: number }).z;
      const fraction = (z - lowerZ) / ((profile[outerRow + 1] as { z: number }).z - lowerZ);
      for (let j = 0; j < angular; j++) {
        const a = vertices[outerRow * angular + j] as Point3;
        const b = vertices[(outerRow + 1) * angular + j] as Point3;
        // boundary = a+(b-a)*fraction
        const boundaryX = a.x + (b.x - a.x) * fraction;
        const boundaryY = a.y + (b.y - a.y) * fraction;
        const outerRadius = hypot(boundaryX, boundaryY);
        const directionX = boundaryX / outerRadius;
        const directionY = boundaryY / outerRadius;
        let lo = 0.0;
        let hi = outerRadius;
        if (z <= p.neckHeight * 0.45) {
          lo = neck - neckWall;
        } else {
          for (let step = 0; step < 15; step++) {
            const middle = (lo + hi) / 2;
            if (surface.isCloserXYZ(localInset, directionX * middle, directionY * middle, z)) hi = middle;
            else lo = middle;
          }
        }
        vertices.push({ x: directionX * lo, y: directionY * lo, z });
      }
    }
    const insideTop = vertices.length;
    vertices.push({ x: 0, y: 0, z: insideHeight });
    for (let i = 0; i < profile.length - 1; i++) {
      for (let j = 0; j < angular; j++) {
        const k = (j + 1) % angular;
        const a = insideStart + i * angular + j;
        const b = insideStart + i * angular + k;
        const c = insideStart + (i + 1) * angular + k;
        const d = insideStart + (i + 1) * angular + j;
        triangles.push({ a, b: c, c: b });
        triangles.push({ a, b: d, c });
      }
    }
    for (let j = 0; j < angular; j++) {
      const k = (j + 1) % angular;
      // Inside crown points toward the empty cavity.
      triangles.push({ a: insideStart + last + j, b: insideTop, c: insideStart + last + k });
      // Annular base joins the two surfaces, leaving the LED opening clear.
      triangles.push({ a: j, b: insideStart + j, c: insideStart + k });
      triangles.push({ a: j, b: insideStart + k, c: k });
    }
    innerRange = { lowerBound: insideStart, upperBound: vertices.length };
    if (layout !== undefined) {
      holePairs = layout.centers.map(
        (column) =>
          [
            StringHoles.patch(2, column, angular, (r, c) => r * angular + c),
            StringHoles.patch(2, column, angular, (r, c) => insideStart + r * angular + c),
          ] as const,
      );
    }
  }
  const mesh = new BalloonMesh(vertices, triangles, (atan(maxSlope) * 180) / PI, innerRange);
  if (p.hangingLoop) {
    // Replace the outer crown only; the reinforced inner crown stays closed.
    const radiusNeeded = CeilingLoop.padRadius(p);
    let row = profile.length - 1;
    while (row >= 0 && !((profile[row] as { r: number }).r >= radiusNeeded)) row -= 1;
    if (row < 0) throw new RangeError('BalloonGenerator: no ring reaches the crown pad');
    CeilingLoop.attach(mesh, row * angular, angular, top, p);
  }
  if (!p.hollow && layout !== undefined) {
    const patches = layout.centers.map((column) => StringHoles.patch(2, column, angular, (r, c) => r * angular + c));
    StringHoles.crossBores(mesh, patches, p.cordClearance, p.neckHeight / 2);
  } else if (holePairs.length > 0) StringHoles.punch(mesh, holePairs);
  else if (p.hangingLoop) StringHoles.compact(mesh);
  return mesh;
}
