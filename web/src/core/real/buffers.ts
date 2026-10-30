// `BalloonMesh` to the contract's `MeshBuffers`, at the worker boundary only.
import type { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import type { MeshBuffers } from '../types';

/** One mesh to transferable arrays. `colors` holds one color group per triangle. */
export function toMeshBuffers(mesh: BalloonMesh, colors?: readonly number[] | Uint8Array): MeshBuffers {
  const { vertices, triangles } = mesh;
  const positions = new Float32Array(vertices.length * 3);
  for (let i = 0, o = 0; i < vertices.length; i++, o += 3) {
    const p = vertices[i] as Point3;
    positions[o] = p.x;
    positions[o + 1] = p.y;
    positions[o + 2] = p.z;
  }
  const indices = new Uint32Array(triangles.length * 3);
  for (let i = 0, o = 0; i < triangles.length; i++, o += 3) {
    const t = triangles[i] as Triangle;
    indices[o] = t.a;
    indices[o + 1] = t.b;
    indices[o + 2] = t.c;
  }
  const { x, y, z } = mesh.dimensions;
  return {
    positions,
    indices,
    ...(colors === undefined ? {} : { faceColors: Uint8Array.from(colors) }),
    maxOverhang: mesh.maxOverhang,
    dimensions: { x, y, z },
  };
}

/** The empty mesh of a cancelled run; the caller discards the result. */
export function emptyMeshBuffers(): MeshBuffers {
  return { positions: new Float32Array(0), indices: new Uint32Array(0), faceColors: new Uint8Array(0), maxOverhang: 0, dimensions: { x: 0, y: 0, z: 0 } };
}
