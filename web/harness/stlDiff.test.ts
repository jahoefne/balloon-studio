import { describe, expect, it } from 'vitest';
import { storedZipArchive } from '../src/core/io/storedZip';
import { compareOutput } from './compare';
import { TETRA_AND_LONE, at, bump, bumpVertexEverywhere, copy, flipSign, normalAt, resealBstl, setFloat, stl, swapTriangles, withBstlHeader, type Tri } from './fixtures';
import { toRow } from './report';
import { statusLabel } from './result';
import { stlFactsProblem } from './stlDiff';

const base = stl(TETRA_AND_LONE);
const compare = (actual: Uint8Array, expected: Uint8Array = base) => compareOutput(expected, actual, 'stl');
const LONE = 4;

describe('STL acceptance (plan WP-V2)', () => {
  it('identical file', () => {
    expect(compare(copy(base)).status).toBe('identical');
  });

  it('one coordinate +1 ULP is `ulp` with count 1', () => {
    const result = compare(bump(base, at(LONE, 0, 1)));
    expect(statusLabel(result)).toBe('ulp');
    expect(result.ulpCount).toBe(1);
    expect(result.maxUlp).toBe(1);
  });

  it('one coordinate -1 ULP as well', () => {
    const result = compare(bump(base, at(LONE, 0, 1), -1));
    expect(result.status).toBe('ulp');
    expect(result.ulpCount).toBe(1);
  });

  it('one coordinate +2 ULP is a mismatch', () => {
    const result = compare(bump(base, at(LONE, 0, 1), 2));
    expect(statusLabel(result)).toBe('mismatch (ulp)');
    expect(result.maxUlp).toBe(2);
  });

  it('swapped triangles are `mismatch (topology)`', () => {
    expect(statusLabel(compare(swapTriangles(base, 0, 1)))).toBe('mismatch (topology)');
  });

  it('a -0 flip is `mismatch (signed zero)`', () => {
    const result = compare(flipSign(base, at(LONE, 0, 0)));
    expect(statusLabel(result)).toBe('mismatch (signed zero)');
  });
});

describe('STL coordinates and topology', () => {
  it('a shared vertex moved everywhere keeps the topology and counts every occurrence', () => {
    const { bytes, occurrences } = bumpVertexEverywhere(base, 0, 1, 0);
    expect(occurrences).toBe(3);
    const result = compare(bytes);
    expect(result.status).toBe('ulp');
    expect(result.ulpCount).toBe(3);
  });

  it('a shared vertex moved in only one triangle splits it: topology', () => {
    expect(statusLabel(compare(bump(base, at(0, 1, 0))))).toBe('mismatch (topology)');
  });

  it('a 1 ULP shift that merges two vertices is a topology error', () => {
    const near = 1 + 2 ** -23;
    const triangles: Tri[] = [
      [[1, 0, 0], [5, 0, 0], [1, 5, 0]],
      [[near, 0, 1], [5, 0, 1], [1, 5, 1]],
      [[near, 0, 0], [6, 0, 0], [1, 6, 0]],
    ];
    const reference = stl(triangles);
    const merged = bump(reference, at(2, 0, 0), -1);
    const result = compare(merged, reference);
    expect(result.tags).toContain('topology');
    expect(result.ulpCount).toBe(1);
  });

  it.each([1e-14, -1e-14, 1e-45, -1e-45, 9e-10, -9e-10])('0 → %d is near zero: `ulp`, counted apart', (value) => {
    const result = compare(setFloat(base, at(LONE, 0, 0), value));
    expect(statusLabel(result)).toBe('ulp');
    expect(result.nearZeroCorners).toBe(1);
    expect(result.ulpCount).toBe(0);
    expect(result.maxUlp).toBe(0);
    expect(result.notes[0]).toContain('1 coordinates differ below 1e-9 mm');
  });

  it('near zero against near zero of the other sign, either way round', () => {
    const plus = setFloat(base, at(LONE, 0, 0), 1e-14);
    const minus = setFloat(base, at(LONE, 0, 0), -1e-14);
    expect(compare(minus, plus).nearZeroCorners).toBe(1);
    expect(compare(base, plus).nearZeroCorners).toBe(1);
    expect(compare(flipSign(base, at(LONE, 0, 0)), plus).status).toBe('ulp');
  });

  it.each([
    ['1e-8 vs 0', 1e-8, 0],
    ['0 vs 1e-8', 0, 1e-8],
    ['1.1e-9 vs 0, just above the limit', 1.1e-9, 0],
    ['1e-8 vs 1e-14', 1e-8, 1e-14],
    ['-1e-8 vs 1e-8', -1e-8, 1e-8],
  ])('outside the limit stays strict: %s', (_, actual, expected) => {
    const result = compare(setFloat(base, at(LONE, 0, 0), actual), setFloat(base, at(LONE, 0, 0), expected));
    expect(statusLabel(result)).toBe('mismatch (ulp)');
    expect(result.nearZeroCorners).toBe(0);
  });

  it('1 ULP above the limit is still a plain ULP', () => {
    const above = setFloat(base, at(LONE, 0, 0), 2e-9);
    const result = compare(bump(above, at(LONE, 0, 0)), above);
    expect(result.status).toBe('ulp');
    expect(result.ulpCount).toBe(1);
    expect(result.nearZeroCorners).toBe(0);
  });

  it('near zero fails `strict` and rolls up from a kit', () => {
    const noisy = setFloat(base, at(LONE, 0, 0), 1e-14);
    const archive = (part: Uint8Array) => storedZipArchive([['A-part.stl', part]]);
    const result = compareOutput(archive(base), archive(noisy), 'zip');
    expect(statusLabel(result)).toBe('ulp');
    expect(result.nearZeroCorners).toBe(1);
    expect(toRow({ ...result, id: 'kit', swiftMs: 0 }).nearZeroCorners).toBe(1);
  });

  it('a near-zero coordinate moved in one occurrence of a shared vertex still splits it', () => {
    const result = compare(setFloat(base, at(0, 0, 0), 1e-14));
    expect(result.tags).toEqual(['topology']);
    expect(result.nearZeroCorners).toBe(1);
  });

  it('a signed zero in one shared occurrence reports both causes', () => {
    expect(compare(flipSign(base, at(0, 0, 0))).tags).toEqual(['signed zero', 'topology']);
  });

  it('non-finite neighbours are not 1 ULP', () => {
    const largest = setFloat(base, at(LONE, 0, 1), 3.4028234663852886e38);
    const infinite = setFloat(base, at(LONE, 0, 1), Infinity);
    expect(compare(infinite, largest).status).toBe('mismatch');
  });

  it('other triangle count, truncation and attribute bytes', () => {
    expect(statusLabel(compare(stl(TETRA_AND_LONE.slice(0, 4))))).toBe('mismatch (triangle count)');
    expect(statusLabel(compare(base.subarray(0, base.length - 1)))).toBe('mismatch (stl format)');
    const attribute = copy(base);
    attribute[84 + 50 * 2 + 48] = 1;
    expect(statusLabel(compare(attribute))).toBe('mismatch (attribute)');
  });
});

describe('STL normals', () => {
  const rotated = (angle: number): Uint8Array => {
    // Lone triangle's normal is +z; tilt it towards x.
    const tilted = setFloat(base, normalAt(LONE, 0), Math.sin(angle));
    return setFloat(tilted, normalAt(LONE, 2), Math.cos(angle));
  };

  it('a small difference is tolerated and counted apart from the coordinates', () => {
    const result = compare(rotated(1e-3));
    expect(result.status).toBe('ulp');
    expect(result.ulpCount).toBe(0);
    expect(result.normalDiffs).toBe(1);
  });

  it('beyond dot 1-1e-6 on a normal triangle is a mismatch', () => {
    expect(statusLabel(compare(rotated(0.01)))).toBe('mismatch (normal)');
  });

  it('beyond dot 1-1e-6 on a sliver is reported with its smallest angle', () => {
    const sliver = stl([[[0, 0, 0], [10, 0, 0], [5, 1e-3, 0]]]);
    const tilted = setFloat(setFloat(sliver, normalAt(0, 0), Math.sin(0.01)), normalAt(0, 2), Math.cos(0.01));
    const result = compare(tilted, sliver);
    expect(result.status).toBe('ulp');
    expect(result.notes.join('\n')).toMatch(/sliver \(smallest angle 1\.\d+e-2°\)/);
  });

  it('a normal that does not fit its vertices fails the writer check on either side', () => {
    const flipped = setFloat(base, normalAt(LONE, 2), -1);
    expect(compare(flipped).tags).toContain('normal');
    expect(compare(base, flipped).tags).toContain('reference normal');
  });
});

describe('BSTL0002 header', () => {
  const reference = withBstlHeader(base);

  it('a body ULP with a resealed digest passes', () => {
    const result = compare(resealBstl(bump(reference, at(LONE, 0, 1))), reference);
    expect(result.status).toBe('ulp');
    expect(result.ulpCount).toBe(1);
  });

  it('a body ULP with a stale digest fails', () => {
    expect(statusLabel(compare(bump(reference, at(LONE, 0, 1)), reference))).toBe('mismatch (digest)');
  });

  it('a digest change without a body change fails', () => {
    const changed = copy(reference);
    changed[62] = (changed[62] as number) ^ 1;
    expect(statusLabel(compare(changed, reference))).toBe('mismatch (digest)');
  });

  it('flags, panels and settings have to be exact', () => {
    const settings = Array.from({ length: 13 }, (_, i) => i + 0.5);
    settings[5] = 5.25;
    expect(statusLabel(compare(withBstlHeader(base, settings), reference))).toBe('mismatch (header, digest)');
    const panels = copy(reference);
    panels[9] = 21;
    expect(compare(resealBstl(panels), reference).tags).toContain('header');
  });

  it('a plain header has to be exact', () => {
    const header = copy(base);
    header[0] = 0x41;
    expect(statusLabel(compare(header))).toBe('mismatch (header)');
  });
});

describe('manifest facts', () => {
  it('finds what the facts disprove and nothing else', () => {
    const bbox = { min: [0, 0, 0] as [number, number, number], max: [10, 21, 30] as [number, number, number] };
    expect(stlFactsProblem({ triangles: 5, bbox }, base)).toBeNull();
    expect(stlFactsProblem({ triangles: 6 }, base)?.tags).toEqual(['triangle count']);
    expect(stlFactsProblem({ bbox: { ...bbox, max: [10, 21, 31] } }, base)?.tags).toEqual(['bbox']);
    expect(stlFactsProblem({}, base.subarray(0, 90))?.tags).toEqual(['stl format']);
    expect(stlFactsProblem({ bbox: { ...bbox, min: [-1e-14, 0, 0] } }, base)).toBeNull();
    expect(stlFactsProblem({ bbox: { ...bbox, min: [-1e-8, 0, 0] } }, base)?.tags).toEqual(['bbox']);
  });

  it('checks the signed part and the self-consistency of a BSTL header', () => {
    const reference = withBstlHeader(base);
    const header = Array.from(reference.subarray(0, 80), (byte) => byte.toString(16).padStart(2, '0')).join('');
    expect(stlFactsProblem({ header }, resealBstl(bump(reference, at(LONE, 0, 1))))).toBeNull();
    expect(stlFactsProblem({ header }, bump(reference, at(LONE, 0, 1)))?.tags).toEqual(['digest']);
    expect(stlFactsProblem({ header }, base)?.tags).toEqual(['header']);
  });
});
