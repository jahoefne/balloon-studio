// Ported from mac/Tests/NailInsertTests.swift @ cbda68d, without the files written to .build/test-output
// (:119-122, plan §8). `inside` is in core/testing/inside.ts. Without FULL the sweep of keyholes and
// nails runs every fifth entry, and the point checks of checkShape only in the default kits.
import { describe, it } from 'vitest';
import { BalloonMesh } from '../src/core/geometry/mesh';
import { cross, sub, unit, type Point3 } from '../src/core/geometry/point3';
import { binarySTL } from '../src/core/io/binaryStl';
import { CloudConstants, cloudParameters, displayName, nailCenterY, normalized } from '../src/core/lamp/cloudGeometry';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { NailInsert, NailInsertGenerator } from '../src/core/lamp/nailInsert';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { cos, PI, sin } from '../src/core/swift/dmath';
import { arrayMax, arrayMin, swiftMin } from '../src/core/swift/minmax';
import { strideThrough } from '../src/core/swift/rounding';
import { check } from '../src/core/testing/check';
import { inside } from '../src/core/testing/inside';
import { ray } from '../src/core/testing/ray';
import { parseSTL } from '../src/core/testing/stl';
import type { CloudParameters, WallLampKind } from '../src/core/types';
import { FULL } from './support/tier';


const up: Point3 = { x: 0, y: 0, z: 1 }, down: Point3 = { x: 0, y: 0, z: -1 };
const close = (actual: number, expected: number, message: string, tolerance = 0.003): void => {
  check(Math.abs(actual - expected) < tolerance, `${message}: ${actual} instead of ${expected}`);
};
const distance = (mesh: BalloonMesh, o: Point3, d: Point3): number => ray(mesh, o, d)?.[0] ?? Infinity;
/** Swift `stride(from:to:by:)` on Doubles: `from + i·by`. */
const strideTo = (from: number, to: number, by: number): number[] => {
  const values: number[] = [];
  for (let i = 0; from + i * by < to; i++) values.push(from + i * by);
  return values;
};
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * The slot insert, measured on its exported triangles and against the
 * back's pocket. Dimensions are stated here, independently of the
 * generator: a body 0.2 mm clear of the chamber's walls, finger tips
 * 0.2 mm beyond them, a slot 0.4 mm wider than the shaft ending 1.8 mm
 * below the top, a 1 mm plate under the head, 2.7 mm deep in a 3 mm
 * chamber, and 0.6 mm shorter than the entry, up to the slot's 8 mm.
 *
 * The insert as printed. `full` adds the slower point checks.
 */
const checkShape = (mesh: BalloonMesh, p: CloudParameters, full: boolean): void => {
  const label = `entry ${p.nailHead}, slot ${p.nailShaft}, nail ${p.nailDiameter}/${p.nailHeadDiameter}`;
  mesh.validate();
  const e = p.nailHead, s = p.nailShaft, a = p.nailDiameter / 2 + 0.2, head = p.nailHeadDiameter / 2;
  const h = swiftMin(e - 0.6, 8), body = e / 2 - 0.2, tip = e / 2 + 0.2;
  const dims = mesh.dimensions, low = arrayMin(mesh.vertices.map((v) => v.z))!;
  close(dims.x, 2 * tip, `Width across the finger tips, ${label}`, 1e-5);
  close(dims.y, h, `Height, ${label}`, 1e-5);
  close(dims.z, 2.7, `Depth, ${label}`, 1e-5);
  check(Math.abs(low) < 1e-9, `Insert below the bed, ${label}`);
  // Printable flat face down: nothing overhangs more than 45° above the bed.
  for (const t of mesh.triangles) {
    const v = [mesh.vertices[t.a]!, mesh.vertices[t.b]!, mesh.vertices[t.c]!], n = unit(cross(sub(v[1]!, v[0]!), sub(v[2]!, v[0]!)));
    check(n.z > -0.7072 || v.every((q) => Math.abs(q.z) < 1e-9), `Overhang on the insert, ${label}`);
  }
  const mid = swiftMin(2.4, h - 1.8 - a - 0.3);
  // Slot and plate: the ray from the slot's middle meets its edge,
  // the ray from behind the cheek meets the plate's back at 1 mm.
  close(distance(mesh, { x: 0, y: mid, z: 0.5 }, { x: 1, y: 0, z: 0 }), a, `Slot, ${label}`);
  close(distance(mesh, { x: 0, y: mid, z: 0.5 }, { x: -1, y: 0, z: 0 }), a, `Slot, ${label}`);
  close(distance(mesh, { x: 0, y: 0.5, z: 0.5 }, { x: 0, y: 1, z: 0 }), h - 1.8 - 0.5, `End of the slot, ${label}`);
  close(distance(mesh, { x: a + 0.05, y: mid, z: 2.5 }, down), 1.5, `Plate under the head, ${label}`);
  // Finger tips 0.2 mm beyond the walls, body and roots inside them.
  close(distance(mesh, { x: 9, y: 0.001, z: 0.5 }, { x: -1, y: 0, z: 0 }), 9 - tip, `Finger tip, ${label}`, 0.002);
  close(distance(mesh, { x: -9, y: h - 0.6, z: 0.5 }, { x: 1, y: 0, z: 0 }), 9 - body, `Body, ${label}`);
  // The mouth is as wide as the lamp's slot or close to it.
  check(distance(mesh, { x: 0, y: 0.002, z: 0.25 }, { x: 1, y: 0, z: 0 }) >= swiftMin(s / 2, body - 1.3 - 0.5) - 0.01, `Narrow mouth, ${label}`);
  // The ramp: the plate's lower back edge is cut off.
  const ramp = distance(mesh, { x: body - 1.5, y: 0.02, z: 3 }, down);
  check(ramp > 2.35 && ramp < 2.6, `No ramp for the head, ${label}`);
  if (!full) return;
  // The shaft at rest and the head's way up behind the plate are free.
  const rest = h - 1.8 - p.nailDiameter / 2;
  for (let step = 0; step < 24; step++) {
    const angle = (step * PI) / 12;
    // The slot's round end is a polygon inside its circle.
    for (const r of [p.nailDiameter / 2 - 0.05, 0.3]) {
      for (const z of [0.05, 0.5, 0.95]) {
        const o: Point3 = { x: r * cos(angle), y: rest + r * sin(angle), z };
        check(!inside(mesh, o), `Shaft blocked at ${JSON.stringify(o)}, ${label}`);
      }
    }
    for (const r of [head, head * 0.6]) {
      for (const y of strideThrough(-2.0, rest, 0.5)) {
        for (const z of [1.05, 1.6, 2.25]) {
          const o: Point3 = { x: r * cos(angle), y: y + r * sin(angle), z };
          check(!inside(mesh, o), `Head's way blocked at ${JSON.stringify(o)}, ${label}`);
        }
      }
    }
    // The head bears on the plate all round its slot.
    const r = (a + head) / 2, o: Point3 = { x: r * cos(angle), y: rest + r * sin(angle), z: 0.5 };
    check(Math.abs(o.x) < a || inside(mesh, o), `No plate under the head at ${JSON.stringify(o)}, ${label}`);
  }
  // The slits free the fingers along their length.
  const cheek = body - 1.3;
  for (const y of [0.2, 1, 2, 3]) {
    check(!inside(mesh, { x: cheek + 0.15, y, z: 0.5 }) && !inside(mesh, { x: -cheek - 0.15, y, z: 0.5 }), `No slit at ${y}, ${label}`);
    check(inside(mesh, { x: cheek - 0.15, y, z: 0.5 }), `No plate beside the slit at ${y}, ${label}`);
  }
};

describe('slot insert', () => {
  // The default lamps: with and without the insert.
  it.each(['cloud', 'sun'] as WallLampKind[])('%s: kit files, unchanged parts, fit in the pocket, finger springs, nail at rest', (kind) => {
    const p = normalized({ ...wallLampDefaults(kind), nailInsert: true });
    const off: CloudParameters = { ...p, nailInsert: false };
    const kit = new CloudKit(p, 'export'), plain = new CloudKit(off, 'export');
    check(plain.insertMesh === null && kit.insertMesh !== null && kit.printedParts === plain.printedParts + 1, 'Parts with the insert');
    const entries = kit.entries(), plainEntries = plain.entries();
    const stls = entries.filter(([name]) => name.endsWith('.stl')), plainSTLs = plainEntries.filter(([name]) => name.endsWith('.stl'));
    const expectedNames = [...plainSTLs.map(([name]) => name), CloudConstants.insertFilename];
    check(stls.length === kit.printedParts && stls.length === expectedNames.length && stls.every(([name], i) => name === expectedNames[i]), 'Kit files with the insert');
    for (const [name, data] of plainSTLs) {
      check(sameBytes(stls.find(([other]) => other === name)![1], data), `${name} changes with the insert`);
    }
    check(
      kit.assemblyColors.length === kit.assembly().triangles.length && kit.assemblyColors.length === kit.assembly(true).triangles.length && kit.rearColors.length === kit.rear.triangles.length && plain.rearColors.length === 0,
      'Preview colors',
    );
    check(
      kit.instructions.includes('## Slot insert for a small nail head') && kit.instructions.includes(`- ${CloudConstants.insertFilename}`) && kit.instructions.includes('narrows the 3.5 mm shaft slot to 2.2 mm') && kit.instructions.includes('3.5 to 3.8 mm') && !plain.instructions.includes('Slot insert') && !plain.instructions.includes('F:'),
      'Assembly notes',
    );
    const mesh = parseSTL(stls[stls.length - 1]![1]);
    checkShape(mesh, p, true);

    // In the back's pocket, measured on the back. The chamber is found
    // by rays from the nail's center: wall side, cap, walls and top.
    const back = parseSTL(stls[0]![1]), cy = nailCenterY(p);
    const near = new BalloonMesh(
      back.vertices,
      back.triangles.filter((t) => {
        const v = [back.vertices[t.a]!, back.vertices[t.b]!, back.vertices[t.c]!];
        return arrayMin(v.map((q) => q.x))! < 12 && arrayMax(v.map((q) => q.x))! > -12 && arrayMin(v.map((q) => q.y))! < cy + 22 && arrayMax(v.map((q) => q.y))! > cy - 12;
      }),
      back.maxOverhang,
    );
    const entryTop = cy + distance(near, { x: 3, y: cy, z: 1.2 }, { x: 0, y: 1, z: 0 });
    const entryBottom = cy - distance(near, { x: 3, y: cy, z: 1.2 }, { x: 0, y: -1, z: 0 });
    const chamberTop = cy + distance(near, { x: 0, y: cy, z: 3.9 }, { x: 0, y: 1, z: 0 });
    const cap = 3.9 + distance(near, { x: 0, y: cy, z: 3.9 }, up);
    const lip = distance(near, { x: 2.5, y: chamberTop - 1, z: 3.9 }, down);
    const wall = distance(near, { x: 0, y: chamberTop - 1, z: 3.9 }, { x: 1, y: 0, z: 0 });
    close(entryTop - entryBottom, 8, 'Entry');
    close(cap, 5.4, 'Cap');
    close(3.9 - lip, 2.4, 'Lip');
    close(wall, 4, 'Chamber');
    close(chamberTop - entryTop, 8, 'Chamber above the entry');
    const placed = kit.placedInsert()[0]!, box = placed.dimensions;
    const low: Point3 = { x: arrayMin(placed.vertices.map((v) => v.x))!, y: arrayMin(placed.vertices.map((v) => v.y))!, z: arrayMin(placed.vertices.map((v) => v.z))! };
    close(low.y + box.y, chamberTop, 'Insert against the top of the chamber');
    close(low.z, 3.9 - lip, 'Insert on the lip');
    check(low.y >= entryTop + 0.5 && box.y <= entryTop - entryBottom - 0.5, 'Insert must pass the entry and clear the shoulder');
    close(cap - (low.z + box.z), 0.3, 'Play to the cap');
    // No material shared with the back, but for the finger tips' spring.
    let shared = 0, springs = 0;
    for (const x of strideThrough(-4.15, 4.15, 0.1)) {
      for (const y of strideTo(low.y + 0.05, low.y + box.y, 0.25)) {
        for (const z of strideTo(low.z + 0.05, low.z + box.z, 0.3)) {
          const o: Point3 = { x, y, z };
          if (!inside(placed, o)) continue;
          if (inside(near, o)) {
            check(Math.abs(x) > 3.99, `Insert and back collide at ${JSON.stringify(o)}, ${displayName(p)}`);
            shared += 1;
          }
          if (Math.abs(x) > 4) springs += 1;
        }
      }
    }
    check(shared > 0 && shared === springs, "Finger tips must press on the chamber's walls");
    // The nail at rest: the head behind the plate, the plate on the lip.
    const rest = kit.nailInsert!.nailY;
    close(rest, chamberTop - 1.8 - 0.9, 'Nail at rest');
    for (const angle of strideTo(0.0, 2 * PI, PI / 8)) {
      const r = 1.65 - 0.05, o: Point3 = { x: r * cos(angle), y: rest + r * sin(angle), z: cap - 0.05 };
      if (Math.abs(o.x) < 1.15 && o.y < rest + 0.9) continue;
      close(distance(placed, o, down), cap - 0.05 - (low.z + 1), 'Head on the plate');
    }
  }, 300_000);

  // Keyholes and nails: every insert that is offered is sound, every
  // refusal says why.
  it('offers only what works', () => {
    let offered = 0, refused = 0;
    const entriesToTry = strideThrough(6.0, 10, 0.5);
    entriesToTry.forEach((entry, index) => {
      if (!FULL && index % 4 !== 0) return;
      for (const slot of strideThrough(2.0, swiftMin(5, entry - 2), 0.5)) {
        for (const shaft of [1.0, 1.5, 1.8, 2.2, 2.6, 3.0]) {
          for (const headSize of [2.4, 3.0, 3.3, 4.0, 4.6, 6.0]) {
            const p = normalized({ ...cloudParameters(), nailHead: entry, nailShaft: slot, nailDiameter: shaft, nailHeadDiameter: headSize, nailInsert: true });
            const insert = NailInsert.create(p), problem = NailInsert.problem(p);
            check((insert === null) === (problem !== null), 'Refusal without a reason');
            if (insert === null) {
              refused += 1;
              continue;
            }
            const a = shaft / 2 + 0.2;
            check(a <= slot / 2 - 0.25 && headSize / 2 - a >= 0.3, `Insert offered where it cannot work: ${entry}/${slot}/${shaft}/${headSize}`);
            checkShape(NailInsertGenerator.generate(insert), p, FULL && offered % 7 === 0);
            offered += 1;
          }
        }
      }
    });
    check(offered > 0 && refused > 0, 'A sweep with nothing offered or nothing refused');
  }, 300_000);

  it('says why', () => {
    const user: CloudParameters = { ...cloudParameters(), nailInsert: true };
    check(NailInsert.create(normalized(user)) !== null, 'The default nail of 1.8 mm with a 3.3 mm head in the default keyhole');
    check(NailInsert.problem(normalized({ ...user, nailHeadDiameter: 2.4 }))?.includes('head of 2.8 mm or more') === true, 'Reason for a small head');
    check(NailInsert.problem(normalized({ ...user, nailHead: 6, nailShaft: 3 }))?.includes('keyhole is too small') === true, 'Reason for a small keyhole');
    const bad = normalized({ ...user, nailDiameter: NaN, nailHeadDiameter: 100 });
    check(bad.nailDiameter === 1.8 && bad.nailHeadDiameter === 8, 'Nail normalization');
  });

  // The four messages of NailInsert.swift:88-99, word for word.
  it('words each refusal as Swift does', () => {
    const user: CloudParameters = { ...cloudParameters(), nailInsert: true };
    check(NailInsert.problem(normalized({ ...user, nailDiameter: 3 })) === 'A 3.0 mm shaft is too thick for the insert to narrow the 3.5 mm slot.', 'Thick shaft');
    check(NailInsert.problem(normalized({ ...user, nailHeadDiameter: 2.4 })) === 'A 2.4 mm head is too small for a 1.8 mm shaft: the insert needs a head of 2.8 mm or more.', 'Small head');
    check(NailInsert.problem(normalized({ ...user, nailHead: 6, nailShaft: 3 })) === 'The keyhole is too small for the insert. Give it a larger head clearance, 8 mm for instance.', 'Small keyhole');
    check(NailInsert.problem(normalized({ ...user, nailHeadDiameter: 6 }))?.startsWith('A head over ') === true, 'Large head');
  });
});
