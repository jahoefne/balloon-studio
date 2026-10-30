// The verdict `equivalent-bounded` (plan §15), on synthetic fixtures. REFS_PACK_DIR points to
// nowhere, so a local pack cannot change the outcome.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storedZipArchive } from '../src/core/io/storedZip';
import type { BoundedLimits } from './boundedDiff';
import { compareCase, compareOutput } from './compare';
import { BOUNDED_CASES } from './equivalentCases';
import { at, bumpVertexEverywhere, copy, normalAt, resealBstl, setFloat, stl, swapTriangles, text, withBstlHeader, type Tri } from './fixtures';
import { ReferenceMismatchError, expectReference } from './index';
import { getCase, isExported, type ExportedCase, type ManifestEntry } from './manifest';
import { loadCaseBody, loadEntryBody } from './refs';
import { formatTable, summarize, toRow } from './report';
import { statusLabel } from './result';

beforeEach(() => {
  vi.stubEnv('REFS_PACK_DIR', '/nonexistent/balloon-pack');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type V = readonly [number, number, number];

const WIDE: BoundedLimits = { triangleCountDifference: 8, verticesWithoutPartner: 16, trianglesWithoutPartner: 64, maxDistance: 0.02, volume: 1e-3, area: 1e-3 };

/** A box whose top is two triangles, or four around a midpoint (one vertex and two triangles more). */
function box(top: 'two' | 'four', h: V = [0, 10, 10], lift = 0): Tri[] {
  const a: V = [0, 0, 0];
  const b: V = [10, 0, 0];
  const c: V = [10, 10, 0];
  const d: V = [0, 10, 0];
  const e: V = [0, 0, 10];
  const f: V = [10, 0, 10];
  const g: V = [10, 10, 10];
  const m: V = [5, 5, 10 + lift];
  const sides: Tri[] = [[a, c, b], [a, d, c], [a, b, f], [a, f, e], [b, c, g], [b, g, f], [c, d, h], [c, h, g], [d, a, e], [d, e, h]];
  return [...sides, ...(top === 'two' ? ([[e, f, g], [e, g, h]] as Tri[]) : ([[e, f, m], [f, g, m], [g, h, m], [h, e, m]] as Tri[]))];
}

const reference = stl(box('two'));
const split = stl(box('four'));
const bounds = (limits: BoundedLimits = WIDE) => ({ bounds: () => limits });
const compare = (actual: Uint8Array, expected: Uint8Array = reference, limits: BoundedLimits = WIDE) => compareOutput(expected, actual, 'stl', bounds(limits));
const LID = 10; // first triangle of the top

describe('an STL with another triangulation', () => {
  it('without the allowlist stays a mismatch', () => {
    expect(statusLabel(compareOutput(reference, split, 'stl'))).toBe('mismatch (triangle count)');
  });

  it('on the allowlist is `equivalent-bounded`, with its measures', () => {
    const result = compare(split);
    expect(statusLabel(result)).toBe('equivalent-bounded');
    expect(result.tags).toEqual([]);
    expect(result.bounded).toMatchObject({ triangleCountDifference: 2, verticesWithoutPartner: 1, trianglesWithoutPartner: 6, maxDistance: 0 });
    expect(result.bounded?.volume).toBeLessThan(1e-14);
    expect(result.bounded?.area).toBeLessThan(1e-14);
    expect(result.differingTriangles).toBe(6);
    expect(result.notes[0]).toContain('1 vertices and 6 triangles without a partner');
  });

  it('counts both sides, whichever has more', () => {
    expect(compare(reference, split).bounded?.verticesWithoutPartner).toBe(1);
    expect(compare(reference, split).bounded?.triangleCountDifference).toBe(2);
  });

  it('identical, `ulp` and `equivalent` results are left alone', () => {
    expect(compare(copy(reference)).status).toBe('identical');
    expect(compare(bumpVertexEverywhere(reference, 0, 1, 0).bytes).status).toBe('ulp');
    const equivalent = compareOutput(reference, swapTriangles(reference, 0, 1), 'stl', { ...bounds(), allowEquivalent: () => true });
    expect(equivalent.status).toBe('equivalent');
  });

  it('a vertex that moved a little is paired, counted and measured', () => {
    const moved = stl(box('two', [0.01, 10, 10]));
    const result = compare(moved);
    expect(result.status).toBe('equivalent-bounded');
    expect(result.bounded?.verticesWithoutPartner).toBe(2);
    expect(result.bounded?.trianglesWithoutPartner).toBe(0);
    expect(result.bounded?.maxDistance).toBeCloseTo(0.01, 6);
  });

  it('a vertex farther than the search has no partner, and its triangles neither', () => {
    const result = compare(stl(box('two', [1, 10, 10])), reference, { ...WIDE, volume: 1, area: 1 });
    expect(result.status).toBe('equivalent-bounded');
    expect(result.bounded?.maxDistance).toBe(0);
    expect(result.bounded?.verticesWithoutPartner).toBe(2);
    expect(result.bounded?.trianglesWithoutPartner).toBe(8);
  });

  it('near-zero noise is a partner', () => {
    const withNoise = stl(box('four'));
    const all = new DataView(withNoise.buffer);
    for (let t = 0; t < 14; t++) {
      for (let v = 0; v < 3; v++) {
        const o = at(t, v, 0);
        if (all.getFloat32(o, true) === 0 && all.getFloat32(o + 4, true) === 0 && all.getFloat32(o + 8, true) === 0) all.setFloat32(o, 1e-14, true);
      }
    }
    const result = compare(withNoise);
    expect(result.status).toBe('equivalent-bounded');
    expect(result.bounded?.verticesWithoutPartner).toBe(1);
    expect(result.bounded?.trianglesWithoutPartner).toBe(6);
  });

  it('another attribute takes the triangle its partner', () => {
    const colored = copy(reference);
    colored[84 + 48] = 1;
    const result = compare(colored);
    expect(result.status).toBe('equivalent-bounded');
    expect(result.bounded?.trianglesWithoutPartner).toBe(2);
  });
});

describe('what stays a mismatch on the allowlist', () => {
  it.each([
    ['triangle count difference', { triangleCountDifference: 1 }, 'triangle count difference 2 over the limit of 1'],
    ['vertices without a partner', { verticesWithoutPartner: 0 }, 'vertices without a partner 1 over the limit of 0'],
    ['triangles without a partner', { trianglesWithoutPartner: 5 }, 'triangles without a partner 6 over the limit of 5'],
  ])('over the limit of %s', (_, limit, message) => {
    const result = compare(split, reference, { ...WIDE, ...limit });
    expect(statusLabel(result)).toBe('mismatch (bounds)');
    expect(result.notes[0]).toBe(message);
    expect(result.bounded).toBeUndefined();
  });

  it('over the limit of the distance', () => {
    const result = compare(stl(box('two', [0.01, 10, 10])), reference, { ...WIDE, maxDistance: 0.006 });
    expect(statusLabel(result)).toBe('mismatch (bounds)');
    expect(result.notes[0]).toMatch(/^largest distance of paired vertices 0\.0\d+ over the limit of 0\.006$/);
  });

  it('over the limit of the volume or of the area', () => {
    const lifted = stl(box('four', [0, 10, 10], 1));
    expect(compare(lifted, reference, { ...WIDE, area: 1 }).notes[0]).toMatch(/^relative volume difference .* over the limit of 0\.001$/);
    expect(compare(lifted, reference, { ...WIDE, volume: 1 }).notes[0]).toMatch(/^relative area difference .* over the limit of 0\.001$/);
  });

  it('an open mesh, on either side', () => {
    const triangles = box('two');
    const open = stl([...triangles.slice(0, LID + 1), triangles[LID] as Tri]);
    const own = compare(open);
    expect(statusLabel(own)).toBe('mismatch (invalid mesh)');
    expect(own.notes[0]).toMatch(/^TS mesh is invalid: /);
    const theirs = compare(split, open);
    expect(statusLabel(theirs)).toBe('mismatch (invalid mesh)');
    expect(theirs.notes[0]).toMatch(/^reference mesh is invalid: /);
  });

  it('a wrong normal or header, or a stale digest: the writer has to be right', () => {
    expect(compare(setFloat(split, normalAt(0, 2), 1)).tags).toContain('normal');
    const plain = copy(split);
    plain[0] = 0x41;
    expect(compare(plain).tags).toContain('header');
    const sealed = withBstlHeader(reference);
    const sealedSplit = withBstlHeader(split);
    expect(statusLabel(compare(sealedSplit, sealed))).toBe('equivalent-bounded');
    const stale = copy(sealedSplit);
    stale[62] = (stale[62] as number) ^ 1;
    expect(compare(stale, sealed).tags).toContain('digest');
    expect(statusLabel(compare(resealBstl(stale), sealed))).toBe('equivalent-bounded');
  });

  it('a file that is not an STL', () => {
    expect(statusLabel(compare(split.subarray(0, 100)))).toBe('mismatch (stl format)');
  });
});

/** The model of a mesh, in the layout of ThreeMF.swift, with `color` as its paint color per triangle. */
function model(triangles: readonly Tri[], color: (index: number) => number = () => 4, head = 'Balloon Studio 1.4'): string {
  const vertices: string[] = [];
  const faces: string[] = [];
  const seen = new Map<string, number>();
  const swift = (value: number): string => (Number.isInteger(value) ? value.toFixed(1) : String(value));
  triangles.forEach((triangle, t) => {
    const corners = triangle.map((point) => {
      const key = point.join();
      let index = seen.get(key);
      if (index === undefined) {
        index = seen.size;
        seen.set(key, index);
        vertices.push(`<vertex x="${swift(point[0])}" y="${swift(point[1])}" z="${swift(point[2])}"/>`);
      }
      return index;
    });
    faces.push(`<triangle v1="${corners[0]}" v2="${corners[1]}" v3="${corners[2]}" pid="2" p1="0" p2="0" p3="0" paint_color="${color(t)}"/>`);
  });
  return [`<?xml version="1.0" encoding="UTF-8"?>`, `<metadata name="Application">${head}</metadata>`, `<object id="1"><mesh><vertices>${vertices.join('\n')}`, `</vertices><triangles>`, ...faces, `</triangles></mesh></object></model>`].join('\n');
}

describe('a 3MF model with another refinement', () => {
  const base = model(box('two'));
  const refined = model(box('four'));
  const diff = (actual: string, expected: string = base, limits: BoundedLimits | null = WIDE) => compareOutput(text(expected), text(actual), 'model', limits === null ? {} : bounds(limits));

  it('without the allowlist stays a mismatch', () => {
    expect(diff(refined, base, null).status).toBe('mismatch');
  });

  it('on the allowlist is `equivalent-bounded`, with its measures', () => {
    const result = diff(refined);
    expect(statusLabel(result)).toBe('equivalent-bounded');
    expect(result.bounded).toMatchObject({ triangleCountDifference: 2, verticesWithoutPartner: 1, trianglesWithoutPartner: 6, maxDistance: 0 });
  });

  it('a renumbered model with the same mesh has no partnerless vertices', () => {
    const triangles = box('two');
    const reordered = model([...triangles.slice(1), triangles[0] as Tri]);
    const result = diff(reordered);
    expect(statusLabel(result)).toBe('equivalent-bounded');
    expect(result.bounded).toEqual({ triangleCountDifference: 0, verticesWithoutPartner: 0, trianglesWithoutPartner: 0, maxDistance: 0, volume: 0, area: 0 });
  });

  it('the distance is measured in Float64 between vertices of the same Float32 bits', () => {
    // 1e-7 at x = 10 stays within one Float32 step (1e-6) but is far beyond the model tolerance.
    const moved = model(box('two', [0, 10, 10]).map((triangle) => triangle.map((point) => (point[0] === 10 && point[1] === 10 && point[2] === 10 ? ([10.0000001, 10, 10] as V) : point)) as unknown as Tri));
    const result = diff(moved);
    expect(statusLabel(result)).toBe('equivalent-bounded');
    expect(result.bounded?.verticesWithoutPartner).toBe(0);
    expect(result.bounded?.maxDistance).toBeCloseTo(1e-7, 9);
    expect(statusLabel(diff(moved, base, { ...WIDE, maxDistance: 1e-8 }))).toBe('mismatch (bounds)');
  });

  it('another paint color takes the triangle its partner', () => {
    const painted = model(box('two'), (t) => (t === 0 ? 8 : 4));
    const result = diff(painted);
    expect(statusLabel(result)).toBe('equivalent-bounded');
    expect(result.bounded?.trianglesWithoutPartner).toBe(2);
    expect(statusLabel(diff(painted, base, { ...WIDE, trianglesWithoutPartner: 1 }))).toBe('mismatch (bounds)');
  });

  it('over a limit, or an open mesh, is a mismatch', () => {
    expect(statusLabel(diff(refined, base, { ...WIDE, verticesWithoutPartner: 0 }))).toBe('mismatch (bounds)');
    const triangles = box('two');
    const open = model([...triangles.slice(0, LID + 1), triangles[LID] as Tri]);
    expect(statusLabel(diff(open))).toBe('mismatch (invalid mesh)');
  });

  it('head and foot stay exact', () => {
    const result = diff(model(box('four'), () => 4, 'Balloon Studio 1.5'));
    expect(statusLabel(result)).toBe('mismatch (model)');
    expect(result.notes[0]).toBe('The text around the vertices and triangles differs');
    expect(statusLabel(diff(refined.replace('</model>', '</modeL>')))).toBe('mismatch (model)');
  });

  it('in a 3MF, only the model has this tolerance', () => {
    const threeMf = (body: string, note = 'Pattern.') => storedZipArchive([['[Content_Types].xml', text('<Types/>')], ['3D/3dmodel.model', text(body)], ['Metadata/balloon-studio.txt', text(note)]]);
    const limitsFor = { bounds: (entry: string | null) => (entry === '3D/3dmodel.model' ? WIDE : undefined) };
    const passing = compareOutput(threeMf(base), threeMf(refined), '3mf', limitsFor);
    expect(statusLabel(passing)).toBe('equivalent-bounded');
    expect(passing.differingTriangles).toBe(6);
    expect(passing.entries?.map((entry) => entry.name)).toEqual(['3D/3dmodel.model']);
    expect(statusLabel(compareOutput(threeMf(base), threeMf(refined, 'Other.'), '3mf', limitsFor))).toBe('mismatch (text)');
    expect(compareOutput(threeMf(base), threeMf(refined), '3mf').status).toBe('mismatch');
  });
});

describe('the allowlist in compareCase', () => {
  const c = getCase('clip-default') as ExportedCase;
  const body = (): Uint8Array => loadCaseBody(c) as Uint8Array;
  const listed = (limits: BoundedLimits = { ...WIDE, volume: 1, area: 1 }) => [{ caseId: c.id, entry: null, reason: 'test', replay: 'test', limits }];
  /** A vertex of the real clip moved by more than a ULP, so the strict rule refuses it. */
  const moved = (): Uint8Array => {
    let bytes = body();
    for (let i = 0; i < 2; i++) bytes = bumpVertexEverywhere(bytes, 3, 1, 0).bytes;
    return bytes;
  };

  it('starts with the 12 models and the 2 fronts, each with a reason and a replay proof', () => {
    expect(BOUNDED_CASES.length).toBe(14);
    expect(BOUNDED_CASES.filter(({ entry }) => entry === '3D/3dmodel.model').length).toBe(12);
    expect(BOUNDED_CASES.filter(({ entry }) => entry === 'B-cloud-front-white-PLA.stl').map(({ caseId }) => caseId)).toEqual(['cloud-sculpted-classic', 'cloud-sculpted-billow-min']);
    for (const { caseId, entry, reason, replay, limits } of BOUNDED_CASES) {
      const listedCase = getCase(caseId);
      if (!isExported(listedCase)) throw new Error(`${caseId} has no output`);
      expect((listedCase.entries as ManifestEntry[]).some((candidate) => candidate.name === entry), `${caseId}/${entry}`).toBe(true);
      expect(reason.length).toBeGreaterThan(40);
      expect(replay).toMatch(/^tests\//);
      expect(Object.values(limits).every((limit) => limit > 0)).toBe(true);
    }
  });

  it('takes the plan’s starting values', () => {
    const limitsOf = (id: string) => BOUNDED_CASES.find(({ caseId }) => caseId === id)?.limits;
    expect(limitsOf('relief-summit-saved')).toMatchObject({ verticesWithoutPartner: 200, trianglesWithoutPartner: 800, maxDistance: 1e-6, volume: 1e-5 });
    expect(limitsOf('cloud-sculpted-classic')).toMatchObject({ verticesWithoutPartner: 16, triangleCountDifference: 8, maxDistance: 0.02, volume: 1e-7, area: 1e-8 });
  });

  it('an unlisted case stays a mismatch, a listed one passes', () => {
    expect(statusLabel(compareCase(c.id, moved()))).toBe('mismatch (ulp)');
    const result = compareCase(c.id, moved(), { boundedCases: listed() });
    expect(statusLabel(result)).toBe('equivalent-bounded');
    expect(result.warnings).toBeUndefined();
    expect(result.bounded?.verticesWithoutPartner).toBe(2);
  });

  it('a listed case over its limits stays a mismatch and is not stale', () => {
    const result = compareCase(c.id, moved(), { boundedCases: listed({ ...WIDE, verticesWithoutPartner: 1, volume: 1, area: 1 }) });
    expect(statusLabel(result)).toBe('mismatch (bounds)');
    expect(result.warnings).toBeUndefined();
  });

  it('a listed case that is better than needed warns "allowlist stale"', () => {
    const stale = (status: string) => [`allowlist stale: clip-default is ${status}, remove it from harness/equivalentCases.ts`];
    const identical = compareCase(c.id, body(), { boundedCases: listed() });
    expect(identical.status).toBe('identical');
    expect(identical.warnings).toEqual(stale('identical'));
    const ulp = compareCase(c.id, bumpVertexEverywhere(body(), 3, 1, 0).bytes, { boundedCases: listed() });
    expect(ulp.status).toBe('ulp');
    expect(ulp.warnings).toEqual(stale('ulp'));
    const equivalent = compareCase(c.id, swapTriangles(body(), 0, 1), { boundedCases: listed() });
    expect(equivalent.status).toBe('equivalent');
    expect(equivalent.warnings).toEqual(stale('equivalent'));
  });

  describe('without the pack', () => {
    it('a listed Tier B entry is `unverified`, even where the manifest’s facts differ', () => {
      const kitCase = getCase('cloud-sculpted-classic') as ExportedCase;
      const entries = kitCase.entries as ManifestEntry[];
      const placeholder = stl([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]);
      const front = 'B-cloud-front-white-PLA.stl';
      const kit = storedZipArchive(entries.map((entry) => [entry.name, loadEntryBody(kitCase, entry) ?? placeholder]));
      const result = compareCase(kitCase.id, kit, { boundedCases: [{ caseId: kitCase.id, entry: front, reason: 'test', replay: 'test', limits: WIDE }, { caseId: kitCase.id, entry: 'A-cloud-back-opaque.stl', reason: 'test', replay: 'test', limits: WIDE }] });
      expect(result.entries?.find((entry) => entry.name === front)?.status).toBe('unverified');
      expect(result.warnings).toBeUndefined();
      const unlisted = compareCase(kitCase.id, kit, { boundedCases: [] });
      expect(unlisted.entries?.find((entry) => entry.name === front)?.tags).toEqual(['triangle count']);
    });

    it('a listed model is `unverified`', () => {
      const textCase = getCase('text-sans-hello') as ExportedCase;
      const entries = textCase.entries as ManifestEntry[];
      const archive = storedZipArchive(entries.map((entry) => [entry.name, loadEntryBody(textCase, entry) ?? text('other')]));
      expect(compareCase(textCase.id, archive).entries?.find((entry) => entry.name === '3D/3dmodel.model')?.status).toBe('unverified');
    });
  });

  it('expectReference passes it, unless strict', () => {
    expect(expectReference(c.id, moved(), { boundedCases: listed() }).status).toBe('equivalent-bounded');
    expect(() => expectReference(c.id, moved(), { boundedCases: listed(), strict: true })).toThrow(ReferenceMismatchError);
    expect(() => expectReference(c.id, moved())).toThrow(ReferenceMismatchError);
  });

  it('the report counts it apart', () => {
    const rows = [compareCase(c.id, moved(), { boundedCases: listed() }), compareCase(c.id, body())].map(toRow);
    expect(rows[0]?.label).toBe('equivalent-bounded');
    expect(rows[0]?.bounded?.verticesWithoutPartner).toBe(2);
    expect(rows[1]?.bounded).toBeNull();
    expect(formatTable(rows)).toContain('| equivalent-bounded |');
    expect(summarize(rows)).toEqual({ identical: 1, ulp: 0, equivalent: 0, 'equivalent-bounded': 1, mismatch: 0, unverified: 0 });
  });
});
