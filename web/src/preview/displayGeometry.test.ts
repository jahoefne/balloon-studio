import { describe, expect, it } from 'vitest';
import { buildDisplayGeometry, GROUP_COUNT } from './displayGeometry';

const SQRT3 = Math.sqrt(3);

/** Faces outward: normals 0 → −z, 1 → −y, 2 → −x, 3 → (1,1,1)/√3. */
const tetrahedron = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
};

/** The tetrahedron moved along model y. Centroid y before the move: 1/3, 0, 1/3, 1/3. */
const shifted = (dy: number) => ({
  ...tetrahedron,
  positions: tetrahedron.positions.map((value, i) => (i % 3 === 1 ? value + dy : value)),
});

/**
 * A little basket wall: a 6-sided ring from z 0 to 10, 40 mm wide, with a flat 10 mm band
 * above it. The band's rim is a 90° edge, the sides meet at 60°.
 */
const basket = () => {
  const sides = 6;
  const levels = [
    [20, 0],
    [20, 10],
    [20, 20],
    [10, 20], // rim step: 90° to the wall
  ] as const;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [radius, z] of levels) {
    for (let s = 0; s < sides; s++) {
      const angle = (s * 2 * Math.PI) / sides;
      positions.push(radius * Math.cos(angle), radius * Math.sin(angle), z);
    }
  }
  for (let level = 0; level < levels.length - 1; level++) {
    for (let s = 0; s < sides; s++) {
      const a = level * sides + s;
      const b = level * sides + ((s + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      indices.push(a, b, d, a, d, c);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
};

const vec = (array: Float32Array, corner: number) => [array[corner * 3]!, array[corner * 3 + 1]!, array[corner * 3 + 2]!];
const expectVec = (actual: number[], expected: number[], digits = 5) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, digits));
};
const length = (v: number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
const expectUnitNormals = (normals: Float32Array) => {
  for (let corner = 0; corner < normals.length / 3; corner++) expect(length(vec(normals, corner))).toBeCloseTo(1, 5);
};

describe('buildDisplayGeometry on a tetrahedron', () => {
  it('de-indexes every triangle into three corners', () => {
    const display = buildDisplayGeometry(tetrahedron);
    expect(display.positions).toHaveLength(4 * 3 * 3);
    expect(display.normals).toHaveLength(4 * 3 * 3);
  });

  it('maps (x,y,z) to (x,z,−y)', () => {
    const display = buildDisplayGeometry({
      positions: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      indices: new Uint32Array([0, 1, 2]),
    });
    expectVec(vec(display.positions, 0), [1, 3, -2]);
    expectVec(vec(display.positions, 1), [4, 6, -5]);
    expectVec(vec(display.positions, 2), [7, 9, -8]);
  });

  it('keeps triangle order and winding', () => {
    const { positions } = buildDisplayGeometry(tetrahedron);
    // Triangle 1 is 0,1,3 in the model: (0,0,0) (1,0,0) (0,0,1) → (0,0,0) (1,0,0) (0,1,0).
    expectVec(vec(positions, 3), [0, 0, 0]);
    expectVec(vec(positions, 4), [1, 0, 0]);
    expectVec(vec(positions, 5), [0, 1, 0]);
  });

  it('smooth mode: area-weighted vertex normals, mapped like the positions', () => {
    const { normals } = buildDisplayGeometry(tetrahedron);
    expectUnitNormals(normals);
    // Vertex 0 touches the three right-angled faces of equal area: model (−1,−1,−1)/√3.
    const atOrigin = [-1 / SQRT3, -1 / SQRT3, 1 / SQRT3];
    expectVec(vec(normals, 0), atOrigin);
    expectVec(vec(normals, 3), atOrigin);
    // Vertex 3 sums the raw normals (0,−1,0) + (−1,0,0) + (1,1,1) = (0,0,1), mapped (0,1,0).
    expectVec(vec(normals, 5), [0, 1, 0]);
  });

  it('smooth mode weights by area, not per face', () => {
    // Two triangles sharing vertex 0: a small one facing +z and a big one facing +x.
    const { normals } = buildDisplayGeometry({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0, 3]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    });
    expectUnitNormals(normals);
    expectVec(vec(normals, 0), [0, 1, 0]); // the two vertices at the origin are separate
    expectVec(vec(normals, 3), [1, 0, 0]);
    const shared = buildDisplayGeometry({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 3, 0, 0, 0, 3]),
      indices: new Uint32Array([0, 1, 2, 0, 3, 4]),
    });
    // Raw normals (0,0,1) and (9,0,0) sum to (9,0,1).
    const d = Math.hypot(9, 1);
    expectVec(vec(shared.normals, 0), [9 / d, 1 / d, 0]);
  });

  it('sharp edges: flat face normals at every corner', () => {
    const { normals } = buildDisplayGeometry(tetrahedron, { sharpEdges: true });
    expectUnitNormals(normals);
    for (const corner of [0, 1, 2]) expectVec(vec(normals, corner), [0, -1, 0]); // model −z
    for (const corner of [3, 4, 5]) expectVec(vec(normals, corner), [0, 0, 1]); // model −y
    for (const corner of [6, 7, 8]) expectVec(vec(normals, corner), [-1, 0, 0]); // model −x
    for (const corner of [9, 10, 11]) expectVec(vec(normals, corner), [1 / SQRT3, 1 / SQRT3, -1 / SQRT3]);
  });

  it('keeps zero normals on degenerate triangles', () => {
    const { normals } = buildDisplayGeometry(
      { positions: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]), indices: new Uint32Array([0, 1, 2]) },
      { sharpEdges: true },
    );
    expect([...normals].every((value) => value === 0)).toBe(true);
  });

  describe('groups', () => {
    it('without colors everything is group 0, and all four groups exist', () => {
      const { groups } = buildDisplayGeometry(tetrahedron);
      expect(groups).toEqual([
        { start: 0, count: 12, materialIndex: 0 },
        { start: 12, count: 0, materialIndex: 1 },
        { start: 12, count: 0, materialIndex: 2 },
        { start: 12, count: 0, materialIndex: 3 },
      ]);
      expect(groups).toHaveLength(GROUP_COUNT);
    });

    it('sorts triangles into contiguous ranges, in order within a group', () => {
      const { groups, positions } = buildDisplayGeometry(tetrahedron, { faceColors: new Uint8Array([3, 1, 3, 2]) });
      expect(groups).toEqual([
        { start: 0, count: 0, materialIndex: 0 },
        { start: 0, count: 3, materialIndex: 1 },
        { start: 3, count: 3, materialIndex: 2 },
        { start: 6, count: 6, materialIndex: 3 },
      ]);
      // Group 1 is triangle 1 (0,1,3), group 2 is triangle 3 (1,2,3), group 3 is triangles 0 then 2.
      expectVec(vec(positions, 1), [1, 0, 0]);
      expectVec(vec(positions, 3), [1, 0, 0]);
      expectVec(vec(positions, 6), [0, 0, 0]);
      expectVec(vec(positions, 7), [0, 0, -1]); // triangle 0 is 0,2,1
      expectVec(vec(positions, 10), [0, 1, 0]); // triangle 2 is 0,3,2
    });

    it('ignores colors of the wrong length', () => {
      const { groups } = buildDisplayGeometry(tetrahedron, { faceColors: [1, 1, 1] });
      expect(groups[0]!.count).toBe(12);
      expect(groups[1]!.count).toBe(0);
    });

    it('accepts a plain array, so an empty `faceColors: []` means no colors like Swift', () => {
      expect(buildDisplayGeometry(tetrahedron, { faceColors: [] }).groups[0]!.count).toBe(12);
      expect(buildDisplayGeometry(tetrahedron, { faceColors: [1, 1, 1, 1] }).groups[1]!.count).toBe(12);
    });

    it('rejects a color that is not a material', () => {
      expect(() => buildDisplayGeometry(tetrahedron, { faceColors: [0, 4, 0, 0] })).toThrow(RangeError);
    });
  });

  describe('cutaway', () => {
    it('drops triangles whose centroid is behind y = −0.0001', () => {
      expect(buildDisplayGeometry(shifted(-0.5), { cutaway: true }).groups[0]!.count).toBe(0);
      const kept = buildDisplayGeometry(shifted(-0.2), { cutaway: true });
      expect(kept.groups[0]!.count).toBe(9); // only 0,1,3 at −0.2 is gone
    });

    it('keeps a triangle exactly on the threshold side', () => {
      const flat = (y: number) => ({
        positions: new Float32Array([0, y, 0, 1, y, 0, 0, y, 1]),
        indices: new Uint32Array([0, 1, 2]),
      });
      expect(buildDisplayGeometry(flat(0), { cutaway: true }).groups[0]!.count).toBe(3);
      expect(buildDisplayGeometry(flat(-0.00005), { cutaway: true }).groups[0]!.count).toBe(3);
      expect(buildDisplayGeometry(flat(-0.001), { cutaway: true }).groups[0]!.count).toBe(0);
    });

    it('leaves the mesh whole when off', () => {
      expect(buildDisplayGeometry(shifted(-0.5)).groups[0]!.count).toBe(12);
    });

    it('computes normals from the kept triangles only', () => {
      // Only face 0,1,3 (model −y) lies at centroid y = −0.2; dropped, vertex 1 loses its pull to −y.
      const whole = buildDisplayGeometry(shifted(-0.2));
      const cut = buildDisplayGeometry(shifted(-0.2), { cutaway: true });
      expectUnitNormals(cut.normals);
      // Corner 0 of the first kept triangle (0,2,1) at vertex 0: raw (0,0,−1) + (−1,0,0) = model (−1,0,−1)/√2.
      expectVec(vec(cut.normals, 0), [-Math.SQRT1_2, -Math.SQRT1_2, 0]);
      expect(vec(whole.normals, 0)[2]).not.toBeCloseTo(0, 3);
    });

    it('does not cap: a cut closed mesh has no new triangles', () => {
      const whole = buildDisplayGeometry(basket());
      const cut = buildDisplayGeometry(basket(), { cutaway: true });
      expect(cut.positions.length).toBeLessThan(whole.positions.length);
      expect(cut.positions.length % 9).toBe(0);
    });

    it('drops colored triangles from their own group', () => {
      const { groups } = buildDisplayGeometry(shifted(-0.2), { cutaway: true, faceColors: [0, 2, 1, 1] });
      expect(groups.map((group) => group.count)).toEqual([3, 6, 0, 0]);
    });
  });
});

describe('buildDisplayGeometry on a small basket', () => {
  // Around vertex 0 the side at +30° has two triangles and the side at −30° one, so the sum
  // of raw normals leans: 2(cos 30, sin 30) + (cos 30, −sin 30) = (3 cos 30, sin 30).
  const d = Math.hypot(3 * Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
  const blendedAtVertex0 = [(3 * Math.cos(Math.PI / 6)) / d, 0, -Math.sin(Math.PI / 6) / d];

  it('sharp without smoothing: every wall facet is flat', () => {
    const display = buildDisplayGeometry(basket(), { sharpEdges: true });
    expectUnitNormals(display.normals);
    // Bottom band, first side: triangles 0 and 1, all six corners share a normal at angle 30° in model xy.
    const expected = [Math.cos(Math.PI / 6), 0, -Math.sin(Math.PI / 6)];
    for (let corner = 0; corner < 6; corner++) expectVec(vec(display.normals, corner), expected);
  });

  it('smooth angle π/5 keeps the 60° sides flat', () => {
    const flat = buildDisplayGeometry(basket(), { sharpEdges: true });
    const soft = buildDisplayGeometry(basket(), { sharpEdges: true, smoothAngle: Math.PI / 5 });
    expectUnitNormals(soft.normals);
    expectVec([...soft.normals.slice(0, 18)], [...flat.normals.slice(0, 18)]);
  });

  it('smooth angle π/2.5 blends the 60° sides but not the 90° rim step', () => {
    const soft = buildDisplayGeometry(basket(), { sharpEdges: true, smoothAngle: Math.PI / 2.5 });
    expectUnitNormals(soft.normals);
    expectVec(vec(soft.normals, 0), blendedAtVertex0);
    // The rim step faces straight up (+z, Three.js +y) and stays that way at the shared ring z = 20:
    // triangles 24.. are the step; their first corner sits on the wall ring.
    const stepCorner = 24 * 3;
    expectVec(vec(soft.normals, stepCorner), [0, 1, 0]);
    // The wall corner on that same vertex ignores the step.
    const wallTop = 12 * 3 + 5; // third corner of triangle 13 is a vertex of ring z = 20
    expect(vec(soft.normals, wallTop)[1]).toBeCloseTo(0, 5);
  });

  it('smooth angle zero means flat, whatever the height says', () => {
    const flat = buildDisplayGeometry(basket(), { sharpEdges: true });
    const below = buildDisplayGeometry(basket(), { sharpEdges: true, smoothBelowHeight: 100 });
    expect(below.normals).toEqual(flat.normals);
  });

  it('smoothBelowHeight blends every face below it, keeps the angle test above', () => {
    const soft = buildDisplayGeometry(basket(), { sharpEdges: true, smoothAngle: Math.PI / 6, smoothBelowHeight: 15 });
    expectUnitNormals(soft.normals);
    // Below 15 the sides around vertex 0 blend although π/6 alone would keep them flat.
    expectVec(vec(soft.normals, 0), blendedAtVertex0);
    // On the ring at z = 20 the angle test still applies: flat side normals.
    const flat = buildDisplayGeometry(basket(), { sharpEdges: true });
    const wallTop = 12 * 3 + 2; // triangle 12 = a,b,d of band 2; its third corner sits at z = 20
    expectVec(vec(soft.normals, wallTop), vec(flat.normals, wallTop));
    // Vertex 7 (z = 10, angle 60°) has three triangles on either side: exactly radial.
    expectVec(vec(soft.normals, 2), [Math.cos(Math.PI / 3), 0, -Math.sin(Math.PI / 3)]);
  });

  it('colors the band and the rim into separate groups', () => {
    const mesh = basket();
    const faceColors = new Uint8Array(mesh.indices.length / 3).fill(0);
    for (let i = 24; i < 36; i++) faceColors[i] = 3;
    const { groups } = buildDisplayGeometry(mesh, { sharpEdges: true, faceColors });
    expect(groups).toEqual([
      { start: 0, count: 72, materialIndex: 0 },
      { start: 72, count: 0, materialIndex: 1 },
      { start: 72, count: 0, materialIndex: 2 },
      { start: 72, count: 36, materialIndex: 3 },
    ]);
  });
});

describe('in-place updates', () => {
  it('overwrites the arrays of a previous result of the same size', () => {
    const first = buildDisplayGeometry(tetrahedron);
    const { positions, normals } = first;
    const moved = { ...tetrahedron, positions: tetrahedron.positions.map((value) => value + 1) };
    const second = buildDisplayGeometry(moved, {}, first);
    expect(second.positions).toBe(positions);
    expect(second.normals).toBe(normals);
    expectVec(vec(second.positions, 0), [1, 1, -1]);
  });

  it('allocates when the size changes', () => {
    const first = buildDisplayGeometry(tetrahedron);
    const second = buildDisplayGeometry(tetrahedron, { cutaway: true, faceColors: [] }, buildDisplayGeometry(basket()));
    expect(second.positions).not.toBe(first.positions);
    expect(second.positions).toHaveLength(first.positions.length);
  });

  it('does not touch the mesh it reads', () => {
    const mesh = { positions: tetrahedron.positions.slice(), indices: tetrahedron.indices.slice() };
    buildDisplayGeometry(mesh, { cutaway: true, sharpEdges: true, smoothAngle: 1 });
    expect(mesh.positions).toEqual(tetrahedron.positions);
    expect(mesh.indices).toEqual(tetrahedron.indices);
  });
});
