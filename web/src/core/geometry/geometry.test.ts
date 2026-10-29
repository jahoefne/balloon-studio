// Tests for point3.ts, mesh.ts, meshBuilder.ts, weld.ts and surfaceQuery.ts against
// tests/fixtures/swift/geometry.txt (probes/geometry.swift, built with the verbatim Swift sources).
import { describe, expect, it } from 'vitest';
import { geodesicSphere, probeTetrahedron } from '../../../tests/support/meshes';
import { doubleToHex, fixtureText, probeValue, SplitMix64 } from '../../../tests/support/swiftProbe';
import { BalloonMesh, MeshError } from './mesh';
import { F64Buf, meshFromBuffers, meshToBuffers, U32Buf } from './meshBuilder';
import { add, cross, dot, length, scale, sub, unit, type Point3 } from './point3';
import { SurfaceQuery } from './surfaceQuery';
import { ExactPointMap, IntKey3Map } from './weld';

const report = fixtureText('swift/geometry.txt');
const ball = (): BalloonMesh => geodesicSphere(3, 23.7, { x: 3.1, y: -2.2, z: 40.5 });

function reason(mesh: BalloonMesh): string {
  try {
    mesh.validate();
    return 'ok';
  } catch (error) {
    if (error instanceof MeshError) return error.message;
    throw error;
  }
}

describe('Point3', () => {
  it('follows Swift arithmetic', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: -4, y: 0.5, z: 2 };
    expect(sub(a, b)).toEqual({ x: 5, y: 1.5, z: 1 });
    expect(add(a, b)).toEqual({ x: -3, y: 2.5, z: 5 });
    expect(scale(a, 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(cross(a, b)).toEqual({ x: 2 * 2 - 3 * 0.5, y: 3 * -4 - 1 * 2, z: 1 * 0.5 - 2 * -4 });
    expect(dot(a, b)).toBe(1 * -4 + 2 * 0.5 + 3 * 2);
    expect(length({ x: 3, y: 4, z: 12 })).toBe(13);
    expect(unit({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
    expect(unit({ x: 0, y: 0, z: 2 })).toEqual({ x: 0, y: 0, z: 1 });
  });
});

describe('BalloonMesh.validate', () => {
  it('accepts valid closed meshes', () => {
    expect(reason(probeTetrahedron())).toBe(probeValue(report, 'tetra'));
    const sphere = ball();
    expect(`${sphere.vertices.length} ${sphere.triangles.length} ${reason(sphere)}`).toBe(probeValue(report, 'sphere'));
  });

  it('reports the Swift error for every kind of damage', () => {
    const cases: [string, (m: BalloonMesh) => BalloonMesh][] = [
      ['empty', (m) => new BalloonMesh(m.vertices.slice(0, 3), [{ a: 0, b: 1, c: 2 }], 0)],
      ['nonfinite', (m) => ((m.vertices[5] as Point3).y = Number.NaN, m)],
      ['infinite', (m) => ((m.vertices[5] as Point3).z = Infinity, m)],
      ['index', (m) => (m.triangles.push({ a: 0, b: 1, c: 99999 }), m)],
      ['negativeIndex', (m) => (m.triangles.push({ a: -1, b: 1, c: 2 }), m)],
      ['collapsed', (m) => (m.triangles.push({ a: 0, b: 0, c: 1 }), m)],
      ['open', (m) => (m.triangles.pop(), m)],
      ['reversed', (m) => {
        const f = m.triangles[0];
        if (f !== undefined) m.triangles[0] = { a: f.a, b: f.c, c: f.b };
        return m;
      }],
      ['insideOut', (m) => ((m.triangles = m.triangles.map((t) => ({ a: t.a, b: t.c, c: t.b }))), m)],
      ['twoBodies', (m) => {
        const n = m.vertices.length;
        const tetra = probeTetrahedron();
        m.vertices.push(...tetra.vertices.map((p) => add(p, { x: 100, y: 0, z: 0 })));
        m.triangles.push(...tetra.triangles.map((t) => ({ a: t.a + n, b: t.b + n, c: t.c + n })));
        return m;
      }],
      ['unusedVertex', (m) => (m.vertices.push({ x: 1, y: 2, z: 3 }), m)],
      ['duplicateFaces', (m) => (m.triangles.push({ a: 0, b: 2, c: 4 }, { a: 0, b: 4, c: 2 }), m)],
    ];
    for (const [name, damage] of cases) {
      expect(reason(damage(ball())), name).toBe(probeValue(report, name));
    }
  });

  it('throws MeshError with the Swift reason and errorDescription', () => {
    const open = ball();
    open.triangles.pop();
    expect(() => open.validate()).toThrow(MeshError);
    try {
      open.validate();
    } catch (error) {
      expect((error as MeshError).reason).toBe('the surface is not consistently closed');
    }
  });

  it('reports a triangle soup as not closed without overfilling its edge table', () => {
    const soup = new BalloonMesh([], [], 0);
    for (let i = 0; i < 200; i++) {
      soup.vertices.push({ x: i, y: 0, z: 0 }, { x: i, y: 1, z: 0 }, { x: i, y: 0, z: 1 });
      soup.triangles.push({ a: 3 * i, b: 3 * i + 1, c: 3 * i + 2 });
    }
    expect(reason(soup)).toBe('The model could not be exported: the surface is not consistently closed');
  });
});

describe('BalloonMesh.dimensions and copy', () => {
  it('match Swift bit for bit', () => {
    const d = ball().dimensions;
    expect([d.x, d.y, d.z].map(doubleToHex).join(' ')).toBe(probeValue(report, 'dimensions'));
    const e = new BalloonMesh([], [], 0).dimensions;
    expect([e.x, e.y, e.z].map(doubleToHex).join(' ')).toBe(probeValue(report, 'emptyDimensions'));
  });

  it('copy() has value semantics', () => {
    const original = ball();
    const copy = original.copy();
    (copy.vertices[0] as Point3).x = 99;
    copy.triangles.pop();
    expect((original.vertices[0] as Point3).x).not.toBe(99);
    expect(original.triangles.length).toBe(512);
  });
});

describe('meshBuilder', () => {
  it('grows typed buffers and round-trips meshes', () => {
    const f = new F64Buf(1);
    const u = new U32Buf(1);
    for (let i = 0; i < 1000; i++) {
      expect(f.push3(i, -i, i / 2)).toBe(3 * i);
      expect(u.push(i)).toBe(i);
    }
    expect(f.length).toBe(3000);
    expect(f.toArray()[2997]).toBe(999);
    expect(u.toArray().length).toBe(1000);
    const sphere = ball();
    const back = meshFromBuffers(meshToBuffers(sphere));
    expect(back.vertices).toEqual(sphere.vertices);
    expect(back.triangles).toEqual(sphere.triangles);
  });
});

describe('weld maps', () => {
  it('IntKey3Map keys exact integers beyond 32 bits and keeps caller-assigned values', () => {
    const map = new IntKey3Map(4);
    const rng = new SplitMix64(5n);
    const keys: [number, number, number][] = [];
    for (let i = 0; i < 5000; i++) {
      const key: [number, number, number] = [Math.round((rng.unit() * 2 - 1) * 3e9), rng.mod(7) - 3, Math.round((rng.unit() * 2 - 1) * 9e15)];
      if (map.get(...key) < 0) {
        map.set(...key, keys.length);
        keys.push(key);
      }
    }
    keys.forEach((key, i) => expect(map.get(...key)).toBe(i));
    expect(map.size).toBe(keys.length);
    expect(map.get(1, 2, 3)).toBe(-1);
    map.set(0, 0, 0, 7);
    expect(map.get(-0, 0, -0)).toBe(7);
    expect(() => map.set(0.5, 0, 0, 1)).toThrow(RangeError);
  });

  it('ExactPointMap matches -0 with 0 and never matches NaN, like Swift Double keys', () => {
    const map = new ExactPointMap();
    map.set(0, -0, 1.5, 0);
    expect(map.get(-0, 0, 1.5)).toBe(0);
    expect(map.get(0, 0, 1.5000000000000002)).toBe(-1);
    map.set(Number.NaN, 0, 0, 1);
    expect(map.get(Number.NaN, 0, 0)).toBe(-1);
    for (let i = 0; i < 1000; i++) map.set(i * 0.1, i, -i, i + 2);
    for (let i = 0; i < 1000; i++) expect(map.get(i * 0.1, i, -i)).toBe(i + 2);
  });
});

describe('SurfaceQuery', () => {
  it('answers isCloser(than:to:) exactly like Swift on 20000 queries', () => {
    const big = geodesicSphere(4, 31.3, { x: -4.4, y: 7.25, z: 12.0 });
    const query = new SurfaceQuery(big.vertices, big.triangles);
    const rng = new SplitMix64(11n);
    let bits = '';
    for (let i = 0; i < 20000; i++) {
      const p = { x: -4.4 + (rng.unit() * 2 - 1) * 45, y: 7.25 + (rng.unit() * 2 - 1) * 45, z: 12 + (rng.unit() * 2 - 1) * 45 };
      const distance = rng.unit() * 18;
      const closer = query.isCloser(distance, p);
      expect(query.isCloserXYZ(distance, p.x, p.y, p.z)).toBe(closer);
      bits += closer ? '1' : '0';
    }
    expect(bits).toBe(probeValue(report, 'query'));
    expect(String(new SurfaceQuery([], []).isCloser(1e9, { x: 0, y: 0, z: 0 }))).toBe(probeValue(report, 'emptyQuery'));
  });

  it('computes distanceSquared bit for bit, degenerate triangles included', () => {
    const rng = new SplitMix64(12n);
    const rp = (): Point3 => ({ x: (rng.unit() * 2 - 1) * 10, y: (rng.unit() * 2 - 1) * 10, z: (rng.unit() * 2 - 1) * 10 });
    const actual: string[] = [];
    for (let i = 0; i < 4000; i++) {
      const p = rp();
      const a = rp();
      const b = i % 50 === 0 ? a : rp();
      const c = i % 77 === 0 ? b : rp();
      const d = SurfaceQuery.distanceSquared(p, a, b, c);
      actual.push(Number.isNaN(d) ? 'nan' : doubleToHex(d));
    }
    expect(actual.join(',')).toBe(probeValue(report, 'distanceSquared'));
  });
});
