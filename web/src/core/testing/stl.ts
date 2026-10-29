// Ported from mac/Tests/GeometryTests.swift @ cbda68d (lines 8-38: parseSTL).
//
// Reads a binary STL independently of the writer: welds vertices by their exact Float32 bit
// patterns (so +0 and -0 stay distinct, as with Swift's `Key(x,y,z: UInt32)`) and requires
// every stored normal to agree with its vertices (dot > 0.999).
import { BalloonMesh } from '../geometry/mesh';
import { cross, dot, sub, unit, type Point3, type Triangle } from '../geometry/point3';
import { IntKey3Map } from '../geometry/weld';
import { swiftDescription } from '../swift/format';
import { check } from './check';

function describePoint(p: Point3): string {
  return `Point3(x: ${swiftDescription(p.x)}, y: ${swiftDescription(p.y)}, z: ${swiftDescription(p.z)})`;
}

/** Swift `GeometryTests.parseSTL(data)`. */
export function parseSTL(data: Uint8Array): BalloonMesh {
  check(data.length >= 84, 'Incorrect binary STL length');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u32 = (offset: number): number => view.getUint32(offset, true);
  const float = (offset: number): number => view.getFloat32(offset, true);
  const count = u32(80);
  check(data.length === 84 + 50 * count, 'Incorrect binary STL length');
  const lookup = new IntKey3Map(count);
  const vertices: Point3[] = [];
  const triangles: Triangle[] = [];
  for (let i = 0; i < count; i++) {
    const start = 84 + 50 * i;
    const face: number[] = [];
    for (let j = 0; j < 3; j++) {
      const o = start + 12 + j * 12;
      const x = u32(o);
      const y = u32(o + 4);
      const z = u32(o + 8);
      const index = lookup.get(x, y, z);
      if (index >= 0) face.push(index);
      else {
        lookup.set(x, y, z, vertices.length);
        face.push(vertices.length);
        vertices.push({ x: float(o), y: float(o + 4), z: float(o + 8) });
      }
    }
    const [f0, f1, f2] = face as [number, number, number];
    const normal: Point3 = { x: float(start), y: float(start + 4), z: float(start + 8) };
    const p0 = vertices[f0] as Point3;
    const p1 = vertices[f1] as Point3;
    const p2 = vertices[f2] as Point3;
    const actual = unit(cross(sub(p1, p0), sub(p2, p0)));
    const agreement = dot(normal, actual);
    if (!(agreement > 0.999)) {
      check(false, `STL face normal does not match its vertices (face ${i}, dot ${swiftDescription(agreement)}, points [${[p0, p1, p2].map(describePoint).join(', ')}])`);
    }
    triangles.push({ a: f0, b: f1, c: f2 });
  }
  return new BalloonMesh(vertices, triangles, 0);
}
