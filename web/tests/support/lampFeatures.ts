// Ported from mac/Tests/CloudTests.swift @ cbda68d: checkLEDLayout (:108-131) and checkCloudFeatures
// (:133-252). The calls of checkCableOutlet and checkCableClamp (:171-173) are WP-K4b's, with
// CableOutletTests.swift and CableClampTests.swift.
import { add, cross, scale, sub, type Point3 } from '../../src/core/geometry/point3';
import type { BalloonMesh } from '../../src/core/geometry/mesh';
import { CableClamp } from '../../src/core/lamp/cableClamp';
import { CableOutlet } from '../../src/core/lamp/cableSeal';
import { cableConfigurations, CloudGenerator, displayName, lampProfile, LampClips, Layout, ledCenterY, nailCenterY, normalized, Rect, totalDepth, verticalScale } from '../../src/core/lamp/cloudGeometry';
import { CloudLEDPlan } from '../../src/core/lamp/cloudLedLayout';
import { atan2, cos, hypot, PI, sin } from '../../src/core/swift/dmath';
import { swiftMax, swiftMin } from '../../src/core/swift/minmax';
import { rounded } from '../../src/core/swift/rounding';
import { check } from '../../src/core/testing/check';
import { ray } from '../../src/core/testing/ray';
import type { CloudParameters } from '../../src/core/types';

export const checkLEDLayout = (input: CloudParameters): void => {
  const p = normalized(input), plan = new CloudLEDPlan(p), l = new Layout(p);
  plan.sections.forEach((s, i) => {
    check(s.length >= p.stripCutLength && Math.abs(s.length / p.stripCutLength - rounded(s.length / p.stripCutLength)) < 1e-8, 'LED section misses a marked cut');
    // Include soldering space and sample the full rectangle, not just corners:
    // a concave cloud scallop may intrude between corners that are inside.
    const area = new Rect(s.x - s.length / 2 - 3, s.x + s.length / 2 + 3, s.y - p.stripWidth / 2 - 0.5, s.y + p.stripWidth / 2 + 0.5);
    const fittings = cableConfigurations(p).flatMap((q) => {
      const clamp = CableClamp.create(q);
      return [new CableOutlet(q).keepOut, ...(clamp === null ? [] : [clamp.keepOut])];
    });
    for (const boss of [l.nailBoss, ...fittings]) {
      check(area.x1 <= boss.x0 || area.x0 >= boss.x1 || area.y1 <= boss.y0 || area.y0 >= boss.y1, 'LED or solder pads cross the nail pocket, the cable seal or its clamp');
    }
    const columns = Math.ceil(area.x1 - area.x0), rows = Math.ceil(area.y1 - area.y0);
    for (let ix = 0; ix <= columns; ix++) {
      for (let iy = 0; iy <= rows; iy++) {
        const x = area.x0 + ((area.x1 - area.x0) * ix) / columns;
        const y = area.y0 + ((area.y1 - area.y0) * iy) / rows;
        const inner = CloudGenerator.radius(atan2(y, x), 2.4 + p.clipFit + 2.0, p.width, verticalScale(p), lampProfile(p));
        check(hypot(x, y) < inner - 1, 'LED or wire landing crosses the skirt');
      }
    }
    for (const other of plan.sections.slice(i + 1)) {
      check(Math.abs(s.y - other.y) >= p.stripWidth + 3.99 || Math.abs(s.x - other.x) >= (s.length + other.length) / 2 + 6, 'LED mounting envelopes overlap');
    }
  });
};

export const checkCloudFeatures = (p: CloudParameters, back: BalloonMesh, front: BalloonMesh, full: boolean): void => {
  // Dimensions are independently stated here; assertions query actual STL triangles.
  const distance = (mesh: BalloonMesh, o: Point3, d: Point3): number => ray(mesh, o, d)?.[0] ?? Infinity;
  const close = (actual: number, expected: number, message: string): void => {
    check(Math.abs(actual - expected) < 0.003, `${message}: got ${actual}, expected ${expected}; ${displayName(p)}, ${p.width} mm, fit ${p.clipFit}, ${p.surface}`);
  };
  const up: Point3 = { x: 0, y: 0, z: 1 }, down: Point3 = { x: 0, y: 0, z: -1 };
  const headY = nailCenterY(p), slotTop = headY + p.nailHead / 2 + 8;
  close(distance(back, { x: 0.173, y: headY + 0.127, z: -1 }, up), 6.4, 'Nail entry lacks a blind roof');
  close(distance(back, { x: 0.173, y: slotTop - 1, z: -1 }, up), 6.4, 'Nail slot leaks into light cavity');
  close(distance(back, { x: 0.173, y: headY, z: 10 }, down), 1.6, 'Missing 3 mm solid nail cap');
  close(distance(back, { x: p.nailShaft / 2 + 0.5, y: slotTop - 1, z: 3 }, down), 0.6, 'Nail head has no retaining lip');
  close(distance(back, { x: 0.271, y: ledCenterY(p), z: 10 }, down), 7, 'LED mounting floor must be flat, without the old recess');
  // Verify actual exported triangles beneath the planned LEDs in the wings,
  // outside the mesher's core, as well as beside the hardware bosses.
  for (const section of new CloudLEDPlan(p).sections) {
    const r = section.footprint(p.stripWidth);
    const points: [number, number][] = [[section.x, section.y], [r.x0, r.y0], [r.x1, r.y1]];
    for (const [x, y] of points) {
      close(distance(back, { x, y, z: p.depth + 1 }, down), p.depth - 2, 'LED plan has no flat mounting floor or crosses hardware');
    }
  }
  if (p.surface === 'flat') {
    close(distance(front, { x: 0.173, y: 0.217, z: -1 }, up), 1, 'Front not flat on bed');
    close(distance(front, { x: 0.173, y: 0.217, z: 3 }, down), 3 - p.diffuserThickness, 'Diffuser thickness wrong');
    for (const t of front.triangles) {
      const a = front.vertices[t.a]!, b = front.vertices[t.b]!, c = front.vertices[t.c]!;
      if ([a, b, c].every((v) => Math.abs(v.z) < 1e-6)) {
        check(cross(sub(b, a), sub(c, a)).z < 0, "Reinforced root folds the front's floor back over itself");
      }
    }
  }

  // Exact seated assembly transform, including winding-preserving front rotation.
  const placed = front.copy();
  placed.vertices = front.vertices.map((v) => (p.surface === 'sculpted' ? { x: v.x, y: v.y, z: v.z + p.depth - 12 } : { x: v.x, y: -v.y, z: totalDepth(p) - v.z }));
  // A cloud's tabs are 10 mm of arc at 0.4 of its width. A sun's are
  // 10 mm of a ray's flank, a quarter turn apart.
  const sun = p.kind === 'sun', clips = new LampClips(p), profile = lampProfile(p), vs = verticalScale(p);
  const centers = sun ? clips.centers : [PI / 6, (5 * PI) / 6, (7 * PI) / 6, (11 * PI) / 6];
  const tab = sun ? clips.half : 5 / (p.width * 0.4), slot = sun ? clips.slit : 1 / (p.width * 0.4);
  const clamp = CableClamp.create(p);
  for (const theta of centers) {
    const dx = cos(theta), dy = sin(theta), out: Point3 = { x: dx, y: dy, z: 0 };
    // On a ray the cavity ends closer to the middle than on a cloud.
    const cavity = CloudGenerator.radius(theta, 2.4 + p.clipFit + 2.0, p.width, vs, profile);
    const beadZ = p.depth - 9.5, start = sun ? swiftMin(p.width * 0.3, cavity - 2) : p.width * 0.3;
    // A point just inside the tab edge is an exact meshing column at
    // both resolutions, independent of the coarser outline chords.
    const probeAngle = theta + tab - 1e-7;
    const probeDirection: Point3 = { x: cos(probeAngle), y: sin(probeAngle), z: 0 };
    const contour = (inset: number): number => CloudGenerator.radius(probeAngle, inset, p.width, vs, profile);
    const running = contour(2.4 + p.clipFit);
    const rootInner = contour(2.4 + p.clipFit + 2.0);
    const beamInner = contour(2.4 + p.clipFit + 1.6);
    const probeStart = swiftMax(0, swiftMin(start, rootInner - 1));
    // Probe the exported inner and outer surfaces: thicker roots,
    // a continuous 4 mm taper, and the original running-fit contour.
    let previousInner: number | undefined;
    for (const height of [1.0, 3, 4, 5, 7]) {
      const origin: Point3 = { x: probeStart * probeDirection.x, y: probeStart * probeDirection.y, z: p.depth - height };
      const inside = distance(placed, origin, probeDirection);
      const outside = inside + 0.01 + distance(placed, add(origin, scale(probeDirection, inside + 0.01)), probeDirection);
      const measuredInner = probeStart + inside;
      if (height === 1) close(measuredInner, rootInner, 'Clip root is not 2.0 mm thick');
      else if (height === 7) close(measuredInner, beamInner, 'Clip beam is not 1.6 mm thick');
      else {
        // Extra slices at cable notches interpolate the curved
        // inset contours differently, but must preserve the taper.
        check(measuredInner > rootInner + 0.003 && measuredInner < beamInner - 0.003, 'Clip root has an abrupt thickness step');
      }
      if (previousInner !== undefined) check(measuredInner > previousInner + 0.003, 'Clip root taper does not thin continuously');
      previousInner = measuredInner;
      close(probeStart + outside, running, "Reinforcement changed the clip's outer fit");
      check(outside - inside >= 1.6 - 0.003, 'Spring tab is thinner than 1.6 mm');
    }
    const catchOrigin: Point3 = { x: probeStart * probeDirection.x, y: probeStart * probeDirection.y, z: beadZ };
    const catchInner = distance(placed, catchOrigin, probeDirection);
    const catchOuter = catchInner + 0.01 + distance(placed, add(catchOrigin, scale(probeDirection, catchInner + 0.01)), probeDirection);
    close(probeStart + catchOuter, contour(2.4 - 0.35), "Reinforcement changed the catch's engagement");
    const o: Point3 = { x: start * dx, y: start * dy, z: beadZ };
    const frontInner = distance(placed, o, out);
    // In a small lamp a post of the strain relief may stand on the
    // way: the back is measured from just inside the skirt.
    const reach = clamp === null ? 0 : swiftMax(0, frontInner - 0.5);
    const backGroove = reach + distance(back, add(o, scale(out, reach)), out);
    // Second face after entering the finger is its outer catch surface.
    const justInside = add(o, scale(out, frontInner + 0.02));
    const beadOuter = frontInner + 0.02 + distance(placed, justInside, out);
    check(beadOuter < backGroove - 0.1, `Clip collides with seated groove at width ${p.width}, depth ${p.depth}, angle ${theta}: catch ${beadOuter}, groove ${backGroove}, front inner ${frontInner}`);
    const wallAtLip = reach + distance(back, add({ x: start * dx, y: start * dy, z: p.depth - 7.5 }, scale(out, reach)), out);
    check(beadOuter > wallAtLip + 0.25, 'Clip has no positive retention');
    const tipZ = p.depth - 12 + 0.01;
    const tipOrigin: Point3 = { x: start * dx, y: start * dy, z: tipZ };
    const innerTip = distance(placed, tipOrigin, out);
    const tipOuter = innerTip + 0.01 + distance(placed, add(tipOrigin, scale(out, innerTip + 0.01)), out);
    check(tipOuter < wallAtLip - 0.1, `Clip lacks lead-in clearance: ${displayName(p)}, ${p.width} mm, ${p.surface}, angle ${theta}, tip ${tipOuter}, wall ${wallAtLip}`);
    // Slots flank the beam and are open over its working length.
    const slotTheta = theta + tab + slot / 2;
    check(ray(placed, { x: start * cos(slotTheta), y: start * sin(slotTheta), z: beadZ }, { x: cos(slotTheta), y: sin(slotTheta), z: 0 }) === undefined, 'Snap beam has no side relief');
  }
  if (full) {
    // Any sampled front point below the diffuser must be outside back material.
    // An inward ray from the cavity returns the opaque inner wall; a front
    // point beyond it would intersect the backing wall in the seated state.
    for (const v of placed.vertices) {
      if (!(v.z < p.depth - 0.001 && v.z > p.depth - 12.001)) continue;
      const r = hypot(v.x, v.y), d: Point3 = { x: v.x / r, y: v.y / r, z: 0 };
      const start = swiftMax(0, r - 1);
      const wall = start + distance(back, { x: d.x * start, y: d.y * start, z: v.z + 0.00001 }, d);
      check(r < wall + 0.003, 'Assembled front intersects backing');
    }
  }
};
