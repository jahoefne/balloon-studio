// Ported from mac/Sources/BalloonStudio/BalloonGeometry.swift @ cbda68d (lines 190-208:
// BalloonMesh.binarySTL).
//
// Writes straight into one buffer: 80-byte header (text, zero-filled), UInt32 triangle count,
// then per triangle the normal `(b-a).cross(c-a).unit` and the three vertices as little-endian
// Float32 (`Float(x)`: round to nearest even, as DataView.setFloat32) and two zero bytes.
import type { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import { swiftMax } from '../swift/minmax';

export const STL_HEADER_TEXT = 'Balloon Studio | millimetres | watertight material | Z up';

/** Swift `mesh.binarySTL()`: validates first (throws MeshError), then writes the binary STL. */
export function binarySTL(mesh: BalloonMesh): Uint8Array {
  mesh.validate();
  const { vertices, triangles } = mesh;
  const out = new Uint8Array(84 + triangles.length * 50);
  for (let i = 0; i < STL_HEADER_TEXT.length; i++) out[i] = STL_HEADER_TEXT.charCodeAt(i);
  const view = new DataView(out.buffer);
  view.setUint32(80, triangles.length, true);
  let o = 84;
  for (let f = 0; f < triangles.length; f++) {
    const t = triangles[f] as Triangle;
    const a = vertices[t.a] as Point3;
    const b = vertices[t.b] as Point3;
    const c = vertices[t.c] as Point3;
    // n = (b-a).cross(c-a).unit
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const d = swiftMax(Math.sqrt(nx * nx + ny * ny + nz * nz), 1e-30);
    view.setFloat32(o, nx / d, true);
    view.setFloat32(o + 4, ny / d, true);
    view.setFloat32(o + 8, nz / d, true);
    view.setFloat32(o + 12, a.x, true);
    view.setFloat32(o + 16, a.y, true);
    view.setFloat32(o + 20, a.z, true);
    view.setFloat32(o + 24, b.x, true);
    view.setFloat32(o + 28, b.y, true);
    view.setFloat32(o + 32, b.z, true);
    view.setFloat32(o + 36, c.x, true);
    view.setFloat32(o + 40, c.y, true);
    view.setFloat32(o + 44, c.z, true);
    // Attribute byte count 0,0 (already zero).
    o += 50;
  }
  return out;
}
