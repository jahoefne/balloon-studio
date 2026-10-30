// Ported from mac/Tests/CloudTests.swift @ cbda68d: checkLEDLayout (:108-131) and checkCloudFeatures
// (:133-252), mac/Tests/CableOutletTests.swift: checkCableOutlet (:117-312), and
// mac/Tests/CableClampTests.swift: checkCableClamp (:4-206).
import { add, cross, dot, length, scale, sub, unit, type Point3 } from '../../src/core/geometry/point3';
import { BalloonMesh } from '../../src/core/geometry/mesh';
import { binarySTL } from '../../src/core/io/binaryStl';
import { CableClamp, CableClampGenerator } from '../../src/core/lamp/cableClamp';
import { CableOutlet, CableSealGenerator } from '../../src/core/lamp/cableSeal';
import { cableClearance, cableConfigurations, cableStartY, CloudConstants, CloudGenerator, compactBlend, displayName, lampProfile, LampClips, Layout, ledCenterY, nailCenterY, normalized, Rect, totalDepth, verticalScale } from '../../src/core/lamp/cloudGeometry';
import { CloudLEDPlan } from '../../src/core/lamp/cloudLedLayout';
import { atan, atan2, cos, hypot, PI, sin } from '../../src/core/swift/dmath';
import { arrayMax, arrayMin, swiftMax, swiftMin } from '../../src/core/swift/minmax';
import { ieeeRemainder, rounded } from '../../src/core/swift/rounding';
import { check } from '../../src/core/testing/check';
import { verticalHits } from '../../src/core/testing/hits';
import { ray } from '../../src/core/testing/ray';
import { parseSTL } from '../../src/core/testing/stl';
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

export const checkCloudFeatures = (p: CloudParameters, back: BalloonMesh, front: BalloonMesh, full: boolean, seal?: BalloonMesh): void => {
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
  const tight = seal ?? parseSTL(binarySTL(CableSealGenerator.generate(p, 'export')));
  checkCableOutlet(p, back, placed, tight, full);
  checkCableClamp(p, back, placed, CableSealGenerator.placed(tight, p), full);
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

/** `var near = back; near.triangles = …`: the same vertices, some of the triangles. */
const withTriangles = (mesh: BalloonMesh, keep: (a: Point3, b: Point3, c: Point3) => boolean): BalloonMesh =>
  new BalloonMesh(mesh.vertices, mesh.triangles.filter((t) => keep(mesh.vertices[t.a]!, mesh.vertices[t.b]!, mesh.vertices[t.c]!)), mesh.maxOverhang);

/** `a.vertices += b.vertices; a.triangles += b.triangles.map { … + offset }` on a new mesh. */
const joined = (a: BalloonMesh, b: BalloonMesh): BalloonMesh => {
  const offset = a.vertices.length;
  return new BalloonMesh([...a.vertices, ...b.vertices], [...a.triangles, ...b.triangles.map((t) => ({ a: t.a + offset, b: t.b + offset, c: t.c + offset }))], a.maxOverhang);
};

/**
 * The outlet in the wall, its pocket and the flexible seal, measured on
 * the exported triangles. `front` is seated on the back.
 */
export const checkCableOutlet = (p: CloudParameters, back: BalloonMesh, front: BalloonMesh, seal: BalloonMesh, full: boolean, otherClamps: readonly CableClamp[] = []): void => {
  const distance = (mesh: BalloonMesh, o: Point3, d: Point3): number => ray(mesh, o, d)?.[0] ?? Infinity;
  const close = (actual: number, expected: number, message: string): void => {
    check(Math.abs(actual - expected) < 0.003, `${message}: ${actual} instead of ${expected}, ${displayName(p)} ${p.width} mm, cable ${p.cableDiameter} ${p.cableSide}`);
  };
  const o = new CableOutlet(p), wall = CloudConstants.wall, floor = CloudConstants.floor;
  const along = sub(o.point3(1, 0, 0), o.point3(0, 0, 0)), across = sub(o.point3(0, 1, 0), o.point3(0, 0, 0));
  const up: Point3 = { x: 0, y: 0, z: 1 }, down: Point3 = { x: 0, y: 0, z: -1 };
  const label = `${displayName(p)} ${p.width} mm, cable ${p.cableDiameter} ${p.cableSide}`;

  // The chosen side, within 30° of it, clear of the clips' columns.
  const clips = new LampClips(p), sun = p.kind === 'sun';
  const outward: Record<CloudParameters['cableSide'], Point3> = { right: { x: 1, y: 0, z: 0 }, left: { x: -1, y: 0, z: 0 }, top: { x: 0, y: 1, z: 0 }, bottom: { x: 0, y: -1, z: 0 } };
  check(dot(along, outward[p.cableSide]) > 0.86, `Cable leaves on the wrong side: ${label}`);
  const strip = atan(o.notchHalfWidth / o.seat);
  for (const clip of sun ? clips.centers : [PI / 6, (5 * PI) / 6, (7 * PI) / 6, (11 * PI) / 6]) {
    const apart = Math.abs(ieeeRemainder(o.angle - clip, 2 * PI));
    check(apart > strip + (sun ? clips.half + clips.slit : 6 / (p.width * 0.4)) + 0.01, `Cable outlet crosses a clip: ${label}`);
  }

  // Nothing is left of the rear outlet. The floor is closed beneath the pocket too.
  const c = cableClearance(p), former = (1.5 + 0.5 * compactBlend(p)) * c + 3 + compactBlend(p);
  const clamp = CableClamp.create(p);
  for (const point of [{ x: -former + c / 2, y: cableStartY(p) + c / 2, z: -1 }, o.point3(o.seat + 3, 0, -1), o.point3(o.seat - 5, 0, -1)]) {
    close(distance(back, point, up), 1, 'Rear of the back is not flat');
    // In a small lamp a post of the strain relief may stand
    // where the rear outlet was.
    const onPost = [...otherClamps, ...(clamp === null ? [] : [clamp])].some((fitting) => {
      const t = fitting.outlet.distanceOf([point.x, point.y]), h = Math.abs(fitting.outlet.offsetOf([point.x, point.y]));
      return t > fitting.start - 0.01 && t < fitting.end + 0.01 && h > fitting.inner - 0.01 && h < fitting.outer + 0.01;
    });
    if (onPost) continue;
    close(distance(back, { x: point.x, y: point.y, z: floor + 0.5 }, down), 0.5, 'Floor is open or raised');
  }

  // A clear way out for the cable's whole jacket.
  const reachIn = o.reach(0, wall), reachOut = o.reach(0, 0);
  const jacket = p.cableDiameter / 2 + 0.2;
  for (const [h, z] of [[0.0, 0.0], [jacket, 0], [-jacket, 0], [0, jacket], [0, -jacket]] as const) {
    check(ray(back, o.point3(o.seat - 4, h, o.axisZ + z), along) === undefined, `Cable route is blocked: ${label}`);
  }
  const middle = o.point3((reachIn + reachOut) / 2, 0, o.axisZ);
  close(distance(back, middle, up), o.windowZ.upper - o.axisZ, 'Window height');
  close(distance(back, middle, down), o.axisZ - o.windowZ.lower, 'Window sill');
  for (const side of [-1.0, 1]) {
    const h = (side * o.window) / 2, t = (o.reach(h, wall) + o.reach(h, 0)) / 2;
    close(distance(back, o.point3(t, 0, o.axisZ), scale(across, side)), o.window / 2, 'Window width');
    // Around the window the wall is whole, without the clips' groove.
    // Between two columns it is a chord of the outline, which shows
    // most where the outline runs along the cable, beside a ray.
    const beside = side * (o.window / 2 + 0.4);
    const inside = o.point3(o.reach(beside, wall) - 1, beside, o.axisZ), outside = o.point3(o.reach(beside, 0) + 1, beside, o.axisZ);
    const behind = distance(back, inside, along), facing = distance(back, outside, scale(along, -1));
    check(Math.abs(behind - 1) < 0.5 && Math.abs(facing - 1) < 0.5, `Wall beside the window: ${behind}, ${facing}, ${label}`);
    const lift: Point3 = { x: 0, y: 0, z: p.depth - 10.25 - o.axisZ };
    close(distance(back, add(inside, lift), along), behind, 'Groove behind the flange');
    close(distance(back, add(outside, lift), scale(along, -1)), facing, 'Wall beside the window');
    check(o.reach(beside, 0) + 1 - facing - (o.reach(beside, wall) - 1 + behind) > wall - 0.01, `Wall beside the window is thin: ${label}`);
  }

  // The pocket: two cheeks on the floor, open above and to the cavity.
  const seated = o.point3(o.seat + 3, 0, o.axisZ);
  close(distance(back, seated, down), o.axisZ - floor, 'Pocket floor');
  check(ray(back, seated, up) === undefined, `Pocket is closed above: ${label}`);
  // Room to slide the seal in, across the whole strip. Only the nail
  // pocket above a small cloud's top outlet may shorten it.
  const landing = o.landing;
  check(landing >= 7 && landing <= 12, `No room to slide the seal in: ${landing} mm, ${label}`);
  check(landing === 12 || (p.kind === 'cloud' && p.cableSide === 'top' && p.width < 140), `Landing is short without need: ${landing} mm, ${label}`);
  check(distance(back, seated, scale(along, -1)) > landing + 3 - 0.003, `Seal's way into the pocket is blocked: ${label}`);
  // The posts of a strain relief stand beside the seal's way.
  const besides = clamp === null ? [o.pocketWidth / 2 + CableOutlet.cheek / 2, o.notchHalfWidth - 0.1] : [o.sealWidth / 2 + 0.1, o.sealWidth / 2 + 0.3];
  for (const h of [...besides.map((b) => -b), 0, ...besides]) {
    for (const z of [floor + 0.3, o.axisZ, o.cheekTop - 0.1]) {
      check(distance(back, o.point3(o.seat - 0.1, h, z), scale(along, -1)) > landing - 0.1 - 0.003, `Floor in front of the pocket is not free: ${label}`);
    }
  }
  for (const side of [-1.0, 1]) {
    close(distance(back, seated, scale(across, side)), o.pocketWidth / 2, 'Pocket width');
    const outside = side * (o.pocketWidth / 2 + CableOutlet.cheek + 2);
    close(distance(back, o.point3(o.seat + 3, outside, floor + 1), scale(across, -side)), 2, 'Cheek thickness');
    const center = side * (o.pocketWidth / 2 + CableOutlet.cheek / 2);
    close(distance(back, o.point3(o.seat + 3, center, p.depth + 1), down), p.depth + 1 - o.cheekTop, 'Cheek height');
    close(distance(back, o.point3(o.seat - 2, center, floor + 1), along), 2, 'Pocket mouth');
  }

  // The seal as printed: one closed body, standing on its flat end.
  seal.validate();
  check(seal.vertices.length - seal.triangles.length / 2 === 2, `Seal must be one body with an open slit: ${label}`);
  check(Math.abs(arrayMin(seal.vertices.map((v) => v.z))!) < 1e-6, `Seal does not stand on the bed: ${label}`);
  const sealSize = seal.dimensions;
  close(sealSize.x, o.sealWidth, 'Seal width');
  close(sealSize.y, o.sealHeight, 'Seal height');
  // The nozzle's end follows the outline from inside.
  const tips: number[] = [];
  for (let i = -20; i <= 20; i++) tips.push(o.reach((i * o.nozzle) / 40, CableOutlet.recess));
  const tipHigh = arrayMax(tips)!, tipLow = arrayMin(tips)!;
  check(sealSize.z < tipHigh - o.sealStart + 0.003 && sealSize.z > tipLow - o.sealStart - 0.1, `Seal length: ${sealSize.z}, between ${tipLow - o.sealStart} and ${tipHigh - o.sealStart}, ${label}`);
  check(sealSize.z >= CableOutlet.handle + CableOutlet.seatLength + wall - CableOutlet.recess - 0.01, `Seal too short: ${label}`);
  // Just past the flange only the nozzle is left, as wide as it is tall.
  const lower = o.nozzleZ - floor - o.sealHeight / 2;
  for (const side of [-1.0, 1]) {
    const past = o.reach((side * o.nozzle) / 2, wall) - o.sealStart + 0.2;
    close(distance(seal, { x: side * 20, y: lower + o.nozzle / 2, z: past }, { x: -side, y: 0, z: 0 }), 20 - o.nozzle / 2, 'Nozzle width');
  }
  const above = o.reach(0.8, wall) - o.sealStart + 0.2;
  close(distance(seal, { x: 0.8, y: 20, z: above }, { x: 0, y: -1, z: 0 }), 20 - lower - o.nozzle, 'Nozzle height');
  close(distance(seal, { x: 0.8, y: -20, z: above }, { x: 0, y: 1, z: 0 }), 20 + lower, 'Nozzle position');
  // Oversize where it is held, undersize around the cable.
  close(o.nozzle - o.window, CableOutlet.squeeze, 'Nozzle squeeze');
  close(o.sealWidth - o.pocketWidth, CableOutlet.slit + CableOutlet.squeeze, 'Pocket must close the slit');
  close(p.cableDiameter - o.bore, CableOutlet.grip, 'Bore grip');
  check(o.cheekTop <= p.depth - 3 && o.windowZ.lower > floor + 0.5, `Outlet leaves its wall: ${label}`);

  // Seated in the back.
  const placed = CableSealGenerator.placed(seal, p);
  close(arrayMin(placed.vertices.map((v) => v.z))!, floor, 'Seal rests on the floor');
  close(arrayMax(placed.vertices.map((v) => v.z))!, o.cheekTop, 'Seal is level with the cheeks');
  for (const v of placed.vertices) {
    const outline = CloudGenerator.radius(atan2(v.y, v.x), CableOutlet.recess - 0.01, p.width, verticalScale(p), lampProfile(p));
    check(hypot(v.x, v.y) < outline + 1e-4, `Seal stands out of the wall: ${label}`);
  }
  check(ray(placed, o.point3(o.sealStart - 1, 0, o.axisZ), along) === undefined, `Bore is blocked: ${label}`);
  const radius = o.bore / 2;
  for (const step of [0, 1, 2, 3, 4, 5, 7]) {
    const a = (step * PI) / 4, d = add(scale(across, cos(a)), scale(up, sin(a)));
    const hit = distance(placed, o.point3(o.seat + 2, 0, o.axisZ), d);
    check(hit < radius + 0.003 && hit > radius * 0.975 - 0.003, `Bore diameter: ${hit * 2} instead of ${o.bore}, ${label}`);
  }
  close(distance(placed, o.point3(o.seat + 2, 0, o.axisZ - radius - 0.2), across), CableOutlet.slit / 2, 'Slit width');
  close(distance(placed, o.point3(o.seat + 2, 0, o.axisZ - radius - 0.2), scale(across, -1)), CableOutlet.slit / 2, 'Slit width');
  // Seen from outside, the nozzle fills the window just inside the surface.
  const opening = (h: number, z: number): boolean => hypot(h, z - o.axisZ) < radius + 0.02 || (Math.abs(h) < CableOutlet.slit / 2 + 0.02 && z < o.axisZ);
  const steps = full ? 9 : 5;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const h = (o.window / 2 - 0.05) * ((2 * i) / (steps - 1) - 1);
      const z = o.windowZ.lower + 0.05 + ((o.window - 0.1) * j) / (steps - 1);
      if (opening(h, z)) continue;
      const outside = o.point3(o.reach(h, 0) + 1, h, z);
      // Inside the outline, with most of its length in the wall.
      const hit = distance(placed, outside, scale(along, -1)), through = o.reach(h, 0) - o.reach(h, wall);
      check(hit > 1 + 0.25 && hit < 1 + through - 1.2, `Nozzle does not fill the window: ends ${hit - 1} mm inside a wall of ${through} mm, ${label}`);
      check(hit < distance(back, outside, scale(along, -1)), `Window is open beside the nozzle: ${label}`);
    }
  }
  // The flange lies against the wall around the window. Beside a ray,
  // where the wall runs away along the cable, it stays level.
  for (const [h, z] of [[o.window / 2 + 0.6, o.axisZ], [-o.window / 2 - 0.6, o.axisZ], [0.8, o.windowZ.upper + 0.45], [0.8, o.windowZ.lower - 0.45]] as const) {
    const inside = o.point3(o.sealStart + 0.05, h, z);
    const flange = distance(placed, inside, along), face = distance(back, inside, along);
    const level = Math.abs(h) <= o.nozzle / 2 ? o.reach(h, wall) : swiftMin(o.reach(h, wall), o.reach(h < 0 ? -o.nozzle / 2 : o.nozzle / 2, wall));
    check(flange < level - o.sealStart - 0.05 + 0.05, `Flange stands ${flange - (level - o.sealStart - 0.05)} mm into the wall: ${label}`);
    check(face > flange - 0.3, `Flange meets the wall ${flange - face} mm early: ${label}`);
    // Level wall: the flange lies against it.
    const nearby = [-0.6, -0.3, 0, 0.3, 0.6].map((offset) => o.reach(h + offset, wall));
    if (arrayMax(nearby)! - arrayMin(nearby)! < 0.2) {
      check(Math.abs(flange - face) < 0.4, `Flange misses the wall by ${face - flange}: ${label}`);
    }
  }

  // Light: no straight line from the cavity leaves through the outlet,
  // except along the bore, which the cable fills, and the pressed slit.
  const here = o.point3(o.seat + 3, 0, 0);
  const outlet = joined(
    withTriangles(back, (a, b, q) => [a, b, q].some((v) => hypot(v.x - here.x, v.y - here.y) < o.notchHalfWidth + 30)),
    placed,
  );
  const lamps = full ? 6 : 3, exits = full ? 5 : 3;
  for (let a = 0; a < lamps; a++) {
    for (let b = 0; b < lamps; b++) {
      for (let i = 0; i < exits; i++) {
        for (let j = 0; j < exits; j++) {
          const from = o.point3(o.sealStart - 2, o.notchHalfWidth * ((2 * a) / (lamps - 1) - 1), floor + 0.3 + ((o.cheekTop + 3 - floor) * b) / (lamps - 1));
          const h = (o.window / 2 - 0.05) * ((2 * i) / (exits - 1) - 1);
          const to = o.point3(o.reach(h, 0) + 0.3, h, o.windowZ.lower + 0.05 + ((o.window - 0.1) * j) / (exits - 1));
          const d = sub(to, from);
          if (distance(outlet, from, unit(d)) < length(d)) continue;
          // Open: only along the bore or the slit, from end to end.
          for (const t of [o.sealStart, o.reach(0, wall)]) {
            const u = (t - o.distanceOf([from.x, from.y])) / (o.distanceOf([to.x, to.y]) - o.distanceOf([from.x, from.y]));
            const q = add(from, scale(d, u));
            check(opening(o.offsetOf([q.x, q.y]), q.z), `Light passes the cable seal: ${label}`);
          }
        }
      }
    }
  }

  // The skirt stays clear of the pocket and the seal.
  for (const v of front.vertices) {
    const h = o.offsetOf([v.x, v.y]), t = o.distanceOf([v.x, v.y]);
    if (Math.abs(h) < o.pocketWidth / 2 + CableOutlet.cheek + 0.5 && t > o.sealStart - 0.5) {
      check(v.z > o.cheekTop + 0.45, `Skirt meets the seal's pocket: ${label}`);
    }
  }
  check(o.notchesSkirt === p.depth - 12 < o.notchTop, `Skirt notch readout: ${label}`);
};

/**
 * The strain relief, measured on the exported triangles: two posts with
 * pilot holes in the back, bar and anvil as printed and as they sit.
 * Dimensions are stated here, independently of the generator.
 * `front` and `seal` are seated on the back.
 */
export const checkCableClamp = (p: CloudParameters, back: BalloonMesh, front: BalloonMesh, seal: BalloonMesh, full: boolean): void => {
  const distance = (mesh: BalloonMesh, o: Point3, d: Point3): number => ray(mesh, o, d)?.[0] ?? Infinity;
  const label = `${displayName(p)} ${p.width} mm, depth ${p.depth}, cable ${p.cableDiameter} ${p.cableSide}`;
  const close = (actual: number, expected: number, message: string): void => {
    check(Math.abs(actual - expected) < 0.003, `${message}: ${actual} instead of ${expected}, ${label}`);
  };
  const o = new CableOutlet(p), floor = CloudConstants.floor, cable = p.cableDiameter;
  const along = sub(o.point3(1, 0, 0), o.point3(0, 0, 0)), across = sub(o.point3(0, 1, 0), o.point3(0, 0, 0));
  const up: Point3 = { x: 0, y: 0, z: 1 }, down: Point3 = { x: 0, y: 0, z: -1 };
  // Two square posts of 7 mm, 3.2 mm before the pocket's mouth, with
  // 0.4 mm either side of the seal between them.
  const inner = o.sealWidth / 2 + 0.4, outer = inner + 7, end = o.seat - 3.2, start = end - 7;
  const screwT = start + 3.5, screwH = inner + 3.5;
  // The cable's underside is 1.6 mm above the floor. Under the ribs
  // it keeps 80% of its diameter. The posts are 6 mm tall or more.
  const rest = 1.6, flat = floor + rest + 0.8 * cable, postTop = swiftMax(floor + 6, flat), rib = swiftMin(0.6, swiftMax(0.4, 0.1 * cable));
  const clamp = CableClamp.create(p);
  if (clamp === null) {
    // Without the clamp the floor is as it was.
    for (const side of [-1.0, 1]) {
      close(distance(back, o.point3(screwT, side * screwH, p.depth + 1), down), p.depth + 1 - floor, 'Floor without a strain relief');
    }
    return;
  }
  close(o.axisZ - cable / 2 - floor, rest, 'Cable above the floor');
  // Faces of the back around the clamp. Those of a large floor reach far.
  const here = o.point3(screwT, 0, 0), reach = outer + 12;
  const near = withTriangles(back, (a, b, c) => {
    const x = [a.x, b.x, c.x], y = [a.y, b.y, c.y];
    return arrayMin(x)! < here.x + reach && arrayMax(x)! > here.x - reach && arrayMin(y)! < here.y + reach && arrayMax(y)! > here.y - reach;
  });

  // The posts.
  for (const side of [-1.0, 1]) {
    for (const [t, h] of [[start + 0.7, inner + 0.7], [end - 0.7, inner + 0.7], [start + 0.7, outer - 0.7], [end - 0.7, outer - 0.7]] as const) {
      close(distance(near, o.point3(t, side * h, p.depth + 1), down), p.depth + 1 - postTop, 'Height of the posts');
    }
    for (const z of [floor + 0.4, postTop - 0.4]) {
      close(distance(near, o.point3(screwT + 2.6, 0, z), scale(across, side)), inner, 'Way between the posts');
      close(distance(near, o.point3(screwT - 2.6, side * (outer + 2), z), scale(across, -side)), 2, 'Width of the posts');
      close(distance(near, o.point3(start - 2, side * (screwH + 2.6), z), along), 2, 'Inner end of the posts');
      close(distance(near, o.point3(end + 1.5, side * (screwH - 2.6), z), scale(along, -1)), 1.5, 'Outer end of the posts');
    }
    // A blind hole of 2.8 mm, with a wider mouth, down to 1.2 mm
    // above the rear. The floor beneath it is closed.
    const axis = o.point3(screwT, side * screwH, 0);
    close(distance(near, add(axis, scale(up, p.depth + 1)), down), p.depth + 1 - 1.2, 'Depth of the pilot hole');
    close(distance(near, add(axis, scale(up, -1)), up), 1, 'Rear of the back is open under a post');
    close(distance(near, add(axis, scale(up, 0.01)), up), 1.19, 'Floor under the pilot hole');
    for (let step = 0; step < 8; step++) {
      const a = (step * PI) / 4 + 0.2, d = add(scale(along, cos(a)), scale(across, sin(a)));
      for (const z of [1.5, floor, postTop - 0.7]) {
        const hit = distance(near, add(axis, scale(up, z)), d);
        check(hit < 1.4 + 0.003 && hit > 1.4 * cos(PI / 24) - 0.003, `Pilot hole: ${2 * hit} mm at ${z}, ${label}`);
        // Printed walls of 2 mm and more around the thread.
        const wall = distance(near, add(add(axis, scale(up, z)), scale(d, hit + 0.01)), d);
        check(z < floor + 0.01 || wall > 2.05, `Wall of a post: ${wall} mm, ${label}`);
      }
      const mouth = distance(near, add(axis, scale(up, postTop - 0.2)), d);
      check(mouth < 1.55 + 0.003 && mouth > 1.55 * cos(PI / 24) - 0.003, `Mouth of the pilot hole: ${2 * mouth} mm, ${label}`);
    }
  }
  // The floor around the posts, and the posts in it: no gaps, nothing
  // doubled, nothing raised.
  const steps = full ? 3 : 1;
  for (let i = 0; i <= 9 * steps; i++) {
    for (let j = 0; j <= 26 * steps; j++) {
      const t = start - 1 + 0.013 + i / steps, h = -outer - 1 + 0.017 + ((j / steps) * (2 * outer + 2)) / 26;
      const hole = hypot(t - screwT, Math.abs(h) - screwH);
      if (hole < 1.75) continue;
      const post = t > start && t < end && Math.abs(h) > inner && Math.abs(h) < outer;
      const hits = verticalHits(near, o.point3(t, h, 0).x, o.point3(t, h, 0).y);
      check(hits.length === 2 && Math.abs(hits[0]!) < 1e-6 && Math.abs(hits[1]! - (post ? postTop : floor)) < 1e-6, `Floor around the posts: ${hits.join(', ')} at ${t - start}, ${h}, ${label}`);
    }
  }
  for (const t of near.triangles) {
    const v = [near.vertices[t.a]!, near.vertices[t.b]!, near.vertices[t.c]!], middle = scale(add(add(v[0]!, v[1]!), v[2]!), 1.0 / 3);
    const lengthwise = o.distanceOf([middle.x, middle.y]), beside = o.offsetOf([middle.x, middle.y]);
    if (!(v.every((q) => Math.abs(q.z - floor) < 1e-6) && lengthwise > start - 2.5 && lengthwise < end + 2.5 && Math.abs(beside) < outer + 2.5)) continue;
    check(cross(sub(v[1]!, v[0]!), sub(v[2]!, v[0]!)).z > 0, `A face of the floor is turned over: ${label}`);
  }

  // The seal's way between the posts, and its landing.
  for (const h of [-o.sealWidth / 2 - 0.3, 0, o.sealWidth / 2 + 0.3]) {
    for (const z of [floor + 0.3, o.axisZ, o.cheekTop - 0.1]) {
      check(distance(near, o.point3(o.seat - 0.1, h, z), scale(along, -1)) > 12 - 0.1 - 0.003, `Posts stand in the seal's way: ${label}`);
    }
  }
  close(distance(near, o.point3(screwT, 0, p.depth + 1), down), p.depth + 1 - floor, 'Floor between the posts');

  // Bar and anvil as printed: closed bodies on the bed, without supports.
  const bar = parseSTL(binarySTL(CableClampGenerator.bar(p))), anvil = parseSTL(binarySTL(CableClampGenerator.anvil(p)));
  bar.validate();
  anvil.validate();
  check(bar.vertices.length - bar.triangles.length / 2 === -2, `Bar must be one body with two screw holes: ${label}`);
  check(anvil.vertices.length - anvil.triangles.length / 2 === 2, `Anvil must be one closed body: ${label}`);
  const tongue = postTop - flat;
  close(bar.dimensions.x, 2 * outer, 'Length of the bar');
  close(bar.dimensions.y, 3 + 2.6 + tongue + rib, 'Height of the bar');
  close(bar.dimensions.z, 7, 'Width of the bar');
  close(anvil.dimensions.x, 7 + 2 * (0.3 + 1.5), 'Length of the anvil');
  close(anvil.dimensions.y, 2 * (inner + 3), 'Width of the anvil');
  close(anvil.dimensions.z, rest + cable / 2, 'Height of the anvil');
  for (const [name, mesh] of [['bar', bar], ['anvil', anvil]] as const) {
    close(arrayMin(mesh.vertices.map((v) => v.z))!, 0, `The ${name} does not lie on the bed`);
    for (const t of mesh.triangles) {
      const v = [mesh.vertices[t.a]!, mesh.vertices[t.b]!, mesh.vertices[t.c]!], normal = unit(cross(sub(v[1]!, v[0]!), sub(v[2]!, v[0]!)));
      if (normal.z > -0.7072 || v.every((q) => Math.abs(q.z) < 1e-6)) continue;
      // The bar's screw holes lie: small bridges, as in any print.
      const hole = name === 'bar' && v.every((q) => hypot(Math.abs(q.x) - screwH, q.z - 3.5) < 1.7 + 0.003);
      check(hole, `The ${name} needs supports: ${JSON.stringify(v)}, ${label}`);
    }
  }

  // Seated.
  const seatedAnvil = CableClampGenerator.placedAnvil(anvil, p), seatedBar = CableClampGenerator.placedBar(bar, p);
  const frame = (v: Point3): { t: number; h: number; z: number } => ({ t: o.distanceOf([v.x, v.y]), h: o.offsetOf([v.x, v.y]), z: v.z });
  const anvilPoints = seatedAnvil.vertices.map(frame), barPoints = seatedBar.vertices.map(frame);
  close(arrayMin(anvilPoints.map((q) => q.z))!, floor, 'The anvil does not lie on the floor');
  close(arrayMin(anvilPoints.map((q) => q.t))!, start - 1.8, 'Inner end of the anvil');
  close(arrayMax(anvilPoints.map((q) => q.t))!, end + 1.8, 'Outer end of the anvil');
  for (const q of anvilPoints) {
    // 0.3 mm of play around the posts.
    check(Math.abs(q.h) < inner - 0.3 + 1e-6 || q.t < start - 0.3 + 1e-6 || q.t > end + 0.3 - 1e-6, `The anvil meets a post: ${JSON.stringify(q)}, ${label}`);
    if (Math.abs(q.z - floor) < 1e-6) {
      const v = o.point3(q.t, q.h * 0.999, floor + 0.5);
      close(distance(near, v, down), 0.5, 'The anvil does not lie on free floor');
    }
  }
  close(arrayMin(barPoints.filter((q) => Math.abs(q.h) > inner + 0.01).map((q) => q.z))!, postTop, 'The bar does not rest on the posts');
  close(arrayMin(barPoints.map((q) => q.t))!, start, 'Inner edge of the bar');
  close(arrayMax(barPoints.map((q) => q.t))!, end, 'Outer edge of the bar');
  close(arrayMax(barPoints.map((q) => Math.abs(q.h)))!, outer, 'Ends of the bar');
  for (const q of barPoints) {
    if (q.z < postTop - 1e-6) check(Math.abs(q.h) < cable / 2 + 0.4 + 1e-6, `The bar's tongue is wider than the way between the rails: ${JSON.stringify(q)}, ${label}`);
  }
  // The tongue passes between the anvil's rails, which end below the bar.
  const rails = anvilPoints.filter((q) => q.z > floor + rest + 1e-6);
  check(rails.every((q) => Math.abs(q.h) > cable / 2 + 0.7 - 1e-6 && Math.abs(q.h) < cable / 2 + 1.7 + 1e-6 && q.z < postTop - 0.5), `Rails of the anvil: ${label}`);
  close(arrayMax(rails.map((q) => q.z))!, floor + rest + cable / 2, 'Height of the rails');
  const parts = joined(seatedBar, seatedAnvil);
  // Ribs of the anvil and of the bar by turns, 1.5 mm apart. Each
  // leaves the cable 80% of its diameter.
  for (const [u, below, above] of [[0.5, rest, flat - floor], [2, rest - rib, flat - floor - rib], [3.5, rest, flat - floor], [5, rest - rib, flat - floor - rib], [6.5, rest, flat - floor]] as const) {
    const middle = o.point3(start + u, 0.05, floor + (below + above) / 2);
    close(distance(parts, middle, down), (above - below) / 2, `Rib under the cable at ${u}`);
    close(distance(parts, middle, up), (above - below) / 2, `Rib over the cable at ${u}`);
    close(above - below, 0.8 * cable, `Squeeze at ${u}`);
  }
  // The cable's axis is free from end to end.
  check(ray(parts, o.point3(start - 4, 0, o.axisZ), along) === undefined, `The clamp blocks the cable: ${label}`);
  // The screws: through the bar into the posts, their heads on the bar.
  const assembly = joined(near, parts);
  for (const side of [-1.0, 1]) {
    const axis = o.point3(screwT, side * screwH, p.depth + 5);
    close(distance(assembly, axis, down), p.depth + 5 - 1.2, "Screw's way into the post");
    for (let step = 0; step < 8; step++) {
      const a = (step * PI) / 4 + 0.2, d = add(scale(along, cos(a)), scale(across, sin(a)));
      // A shaft of 3 mm passes the bar. A head of 6 mm sits on it.
      check(distance(parts, add(axis, scale(d, 1.55)), down) > 100, `Screw hole of the bar: ${label}`);
      close(distance(parts, add(axis, scale(d, 1.9)), down), p.depth + 5 - postTop - 3, 'Seat of the screw head');
      close(distance(parts, add(axis, scale(d, 2.9)), down), p.depth + 5 - postTop - 3, 'Seat of the screw head');
    }
  }
  // M3 × 10: 7 mm of thread in the post, and room beneath its tip.
  const engagement = 10.0 - 3, depth = postTop - 1.2;
  check(engagement >= 2 * 3 && depth >= engagement + 0.5, `Thread of ${engagement} mm in a hole of ${depth} mm: ${label}`);
  check(clamp.engagement === engagement && Math.abs(clamp.holeDepth - depth) < 1e-9, `Readout of the thread: ${label}`);
  // Under the front, inside its skirt, clear of the seal.
  const top = postTop + 3 + 2.6;
  check(top <= p.depth - 0.4 + 1e-9 && Math.abs(clamp.top - top) < 1e-9, `Screw heads reach the diffuser: ${top} of ${p.depth} mm, ${label}`);
  close(arrayMax(barPoints.map((q) => q.z))!, top, "The bar's crown is level with the screw heads");
  const sealStart = arrayMin(seal.vertices.map((v) => o.distanceOf([v.x, v.y])))!;
  check(arrayMax(anvilPoints.map((q) => q.t))! < sealStart - 0.4 + 0.003, `The anvil meets the seal: ${label}`);
  const clampVertices = [...seatedBar.vertices, ...seatedAnvil.vertices];
  for (const v of clampVertices) {
    const skirt = CloudGenerator.radius(atan2(v.y, v.x), CloudConstants.wall + p.clipFit + 2.0, p.width, verticalScale(p), lampProfile(p));
    check(hypot(v.x, v.y) < skirt - 0.65, `The clamp meets the reinforced root: ${skirt - hypot(v.x, v.y)} mm, ${label}`);
    const beam = CloudGenerator.radius(atan2(v.y, v.x), CloudConstants.wall + p.clipFit + 1.6, p.width, verticalScale(p), lampProfile(p));
    check(hypot(v.x, v.y) < beam - 1.05, `The clamp blocks the reinforced spring tab: ${label}`);
  }
  for (const v of front.vertices) {
    const q = frame(v);
    if (q.t > start - 2.3 && q.t < end + 2.3 && Math.abs(q.h) < outer + 0.5) {
      check(q.z > top + 0.39, `The front meets the clamp: ${JSON.stringify(q)}, ${label}`);
    }
  }
  // Clear of the nail pocket, by 1.5 mm and more.
  const boss = new Layout(p).nailBoss;
  for (const q of clampVertices) {
    check(!boss.expanded(1.499).contains(q.x, q.y), `The clamp meets the nail pocket: ${label}`);
  }
  // No LEDs under the clamp.
  const keep = clamp.keepOut;
  for (const v of clampVertices) {
    check(v.x >= keep.x0 - 1e-5 && v.x <= keep.x1 + 1e-5 && v.y >= keep.y0 - 1e-5 && v.y <= keep.y1 + 1e-5, `LED keep-out misses the clamp: ${label}`);
  }
};
