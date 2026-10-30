// The verdict `equivalent` (plan §14), on synthetic fixtures. REFS_PACK_DIR points to nowhere, so a
// local pack cannot change the outcome.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storedZipArchive } from '../src/core/io/storedZip';
import { compareCase, compareOutput } from './compare';
import { EQUIVALENT_CASES } from './equivalentCases';
import { at, bump, bumpVertexEverywhere, copy, flipSign, resealBstl, setFloat, stl, swapTriangles, text, withBstlHeader, type Tri } from './fixtures';
import { ReferenceMismatchError, expectReference } from './index';
import { getCase, isExported, type ExportedCase, type ManifestEntry } from './manifest';
import { loadCaseBody, loadEntryBody } from './refs';
import { formatTable, summarize, toRow, writeReport } from './report';
import { statusLabel } from './result';

beforeEach(() => {
  vi.stubEnv('REFS_PACK_DIR', '/nonexistent/balloon-pack');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type V = readonly [number, number, number];

/** A box whose top quad is split along either diagonal; `lift` raises one top corner, `shift` moves another within the top. */
function box(diagonal: 'eg' | 'fh', lift = 0, shift = 0): Tri[] {
  const a: V = [0, 0, 0];
  const b: V = [10, 0, 0];
  const c: V = [10, 10, 0];
  const d: V = [0, 10, 0];
  const e: V = [0, 0, 10];
  const f: V = [10, 0, 10];
  const g: V = [10, 10, 10 + lift];
  const h: V = [shift, 10, 10];
  const sides: Tri[] = [[a, c, b], [a, d, c], [a, b, f], [a, f, e], [b, c, g], [b, g, f], [c, d, h], [c, h, g], [d, a, e], [d, e, h]];
  return [...sides, ...(diagonal === 'eg' ? ([[e, f, g], [e, g, h]] as Tri[]) : ([[e, f, h], [f, g, h]] as Tri[]))];
}

/** A prism over a dart: the wrong diagonal of the reflex top keeps the signed volume but adds area. */
function dartPrism(diagonal: 'inside' | 'outside'): Tri[] {
  const point = (x: number, y: number, z: number): V => [x, y, z];
  const [a, b, c, d] = [point(0, 0, 0), point(10, 0, 0), point(3, 3, 0), point(0, 10, 0)];
  const [e, f, g, h] = [point(0, 0, 10), point(10, 0, 10), point(3, 3, 10), point(0, 10, 10)];
  const sides: Tri[] = [[a, c, b], [a, d, c], [a, b, f], [a, f, e], [b, c, g], [b, g, f], [c, d, h], [c, h, g], [d, a, e], [d, e, h]];
  return [...sides, ...(diagonal === 'inside' ? ([[e, f, g], [e, g, h]] as Tri[]) : ([[e, f, h], [f, g, h]] as Tri[]))];
}

const reference = stl(box('eg'));
const flipped = stl(box('fh'));
const allowed = { allowEquivalent: () => true };
const compare = (actual: Uint8Array, expected: Uint8Array = reference, options: { allowEquivalent?: () => boolean } = allowed) => compareOutput(expected, actual, 'stl', options);
const TOP = 10;

describe('a fan flip', () => {
  it('without the allowlist stays `mismatch (topology)` and says it would pass', () => {
    const result = compare(flipped, reference, {});
    expect(statusLabel(result)).toBe('mismatch (topology)');
    expect(result.differingTriangles).toBe(0);
    expect(result.notes[0]).toMatch(/^2 triangles differ, same solid .*not on the allowlist \(harness\/equivalentCases\.ts\)$/);
  });

  it('on the allowlist is `equivalent`, with the number of differing triangles', () => {
    const result = compare(flipped);
    expect(statusLabel(result)).toBe('equivalent');
    expect(result.tags).toEqual([]);
    expect(result.differingTriangles).toBe(2);
    expect(result.maxUlp).toBe(0);
    expect(result.notes[0]).toContain('same solid');
  });

  it('identical bytes stay `identical` whatever the allowlist says', () => {
    expect(compare(copy(reference)).status).toBe('identical');
  });

  it('ordinary differences do not become `equivalent`', () => {
    const shifted = bumpVertexEverywhere(reference, 0, 1, 0);
    const result = compare(shifted.bytes);
    expect(result.status).toBe('ulp');
    expect(result.differingTriangles).toBe(0);
  });

  it('reordered triangles are the same solid', () => {
    expect(compare(swapTriangles(reference, 0, 5)).status).toBe('equivalent');
  });

  it('the corner rule applies between the vertex sets: 1 ULP passes and is counted', () => {
    // Small enough a step that the volume stays within 1e-9: x = 0.001 has an ULP of 1e-10.
    const moved = bumpVertexEverywhere(stl(box('fh', 0, 0.001)), TOP, 2, 0);
    const result = compare(moved.bytes, stl(box('eg', 0, 0.001)));
    expect(statusLabel(result)).toBe('equivalent');
    expect(result.ulpCount).toBe(1);
    expect(result.maxUlp).toBe(1);
  });

  it('near-zero noise passes and is counted, even where it would change the sort', () => {
    // Vertex a is (0,0,0): noise on its x sorts it behind the other x = 0 vertices unless the sort treats it as 0.
    let noisy = copy(flipped);
    const triangles = new DataView(noisy.buffer).getUint32(80, true);
    const view = new DataView(noisy.buffer);
    for (let t = 0; t < triangles; t++) {
      for (let v = 0; v < 3; v++) {
        const o = at(t, v, 0);
        if (view.getFloat32(o, true) === 0 && view.getFloat32(o + 4, true) === 0 && view.getFloat32(o + 8, true) === 0) noisy = setFloat(noisy, o, 1e-14);
      }
    }
    const result = compare(noisy);
    expect(statusLabel(result)).toBe('equivalent');
    expect(result.nearZeroCorners).toBe(1);
  });
});

describe('what the rule refuses, also on the allowlist', () => {
  const refused = (result: ReturnType<typeof compare>, problem: RegExp): void => {
    expect(statusLabel(result)).toBe('mismatch (topology)');
    expect(result.notes[0]).toMatch(problem);
  };

  it('another volume', () => {
    refused(compare(stl(box('fh', 1)), stl(box('eg', 1))), /^Not the same solid: signed volume /);
  });

  it('the same volume with another surface area', () => {
    refused(compare(stl(dartPrism('outside')), stl(dartPrism('inside'))), /^Not the same solid: surface area /);
  });

  it('an open surface', () => {
    const triangles = box('eg');
    const open = stl([...triangles.slice(0, TOP + 1), triangles[TOP] as Tri]);
    refused(compare(open), /^Not the same solid: TS mesh is invalid: /);
  });

  it('a broken reference', () => {
    const triangles = box('eg');
    const open = stl([...triangles.slice(0, TOP + 1), triangles[TOP] as Tri]);
    refused(compare(flipped, open), /^Not the same solid: reference mesh is invalid: /);
  });

  it('a vertex 1 ULP away that moves the volume beyond 1e-9', () => {
    // x = 1 is unique in this box, so the sort is not disturbed; its ULP of 1.2e-7 moves the volume by 4e-9.
    refused(compare(bumpVertexEverywhere(stl(box('fh', 0, 1)), TOP, 2, 0).bytes, stl(box('eg', 0, 1))), /^Not the same solid: signed volume /);
  });

  it('a vertex 1 ULP away that changes the lexicographic order (the literal rule, on the safe side)', () => {
    // x = 10 is shared by four vertices, so this one sorts behind them and the pairs no longer line up.
    refused(compare(bumpVertexEverywhere(flipped, TOP, 1, 0).bytes), /^Not the same solid: sorted vertex \d+ differs \(far\)/);
  });

  it('a vertex 2 ULP away', () => {
    let moved = copy(flipped);
    for (let i = 0; i < 2; i++) moved = bumpVertexEverywhere(moved, TOP, 1, 0).bytes;
    refused(compare(moved), /^Not the same solid: sorted vertex \d+ differs \(far\)/);
  });

  it('a vertex of opposite signed zero', () => {
    const view = new DataView(flipped.buffer);
    let signed = copy(flipped);
    for (let t = 0; t < 12; t++) {
      for (let v = 0; v < 3; v++) {
        const o = at(t, v, 0);
        if (view.getFloat32(o, true) === 0 && view.getFloat32(o + 4, true) === 0 && view.getFloat32(o + 8, true) === 0) signed = flipSign(signed, o);
      }
    }
    refused(compare(signed), /^Not the same solid: sorted vertex \d+ differs \(signed zero\)/);
  });

  it('other unique vertices', () => {
    refused(compare(bump(flipped, at(TOP, 1, 0))), /^Not the same solid: 9 unique vertices, reference has 8$/);
  });

  it('other attribute bytes', () => {
    const attribute = copy(flipped);
    attribute[84 + 48] = 1;
    expect(statusLabel(compare(attribute))).toBe('mismatch (topology, attribute)');
  });

  it('another triangle count', () => {
    expect(statusLabel(compare(stl(box('fh').slice(0, 11))))).toBe('mismatch (triangle count)');
  });

  it('a wrong header or digest', () => {
    const plain = copy(flipped);
    plain[0] = 0x41;
    expect(statusLabel(compare(plain))).toBe('mismatch (topology, header)');
    const sealed = withBstlHeader(reference);
    const flippedSealed = withBstlHeader(flipped);
    expect(statusLabel(compare(flippedSealed, sealed))).toBe('equivalent');
    const stale = copy(flippedSealed);
    stale[62] = (stale[62] as number) ^ 1;
    expect(statusLabel(compare(stale, sealed))).toBe('mismatch (topology, digest)');
    expect(statusLabel(compare(resealBstl(stale), sealed))).toBe('equivalent');
  });

  it('a stored normal that does not fit', () => {
    const wrong = setFloat(flipped, 84 + 8, 1);
    expect(compare(wrong).tags).toContain('normal');
  });
});

describe('in an archive', () => {
  const entries = (part: Uint8Array): [string, Uint8Array][] => [['A-part.stl', part], ['B-part.stl', reference], ['ASSEMBLY.md', text('# Kit\n')]];
  const archive = storedZipArchive(entries(reference));

  it('counts for the listed entry only', () => {
    const listed = compareOutput(archive, storedZipArchive(entries(flipped)), 'zip', { allowEquivalent: (name) => name === 'A-part.stl' });
    expect(statusLabel(listed)).toBe('equivalent');
    expect(listed.differingTriangles).toBe(2);
    expect(listed.entries?.map((entry) => [entry.name, entry.status])).toEqual([['A-part.stl', 'equivalent']]);
    const other = compareOutput(archive, storedZipArchive(entries(flipped)), 'zip', { allowEquivalent: (name) => name === 'B-part.stl' });
    expect(statusLabel(other)).toBe('mismatch (topology)');
    expect(statusLabel(compareOutput(archive, storedZipArchive(entries(flipped)), 'zip'))).toBe('mismatch (topology)');
  });

  it('rolls up over `ulp` and under `mismatch`', () => {
    const moved = bumpVertexEverywhere(reference, 0, 1, 0).bytes;
    const mixed = (b: Uint8Array, md: string) => storedZipArchive([['A-part.stl', flipped], ['B-part.stl', b], ['ASSEMBLY.md', text(md)]]);
    const allow = { allowEquivalent: (name: string | null) => name === 'A-part.stl' };
    expect(statusLabel(compareOutput(archive, mixed(moved, '# Kit\n'), 'zip', allow))).toBe('equivalent');
    expect(statusLabel(compareOutput(archive, mixed(moved, '# Other\n'), 'zip', allow))).toBe('mismatch (text)');
  });
});

describe('the allowlist in compareCase', () => {
  const c = getCase('clip-default') as ExportedCase;
  const body = (): Uint8Array => loadCaseBody(c) as Uint8Array;
  const list = [{ caseId: c.id, entry: null, reason: 'test' }];

  it('lists the clamp entries of three kits, each with a reason', () => {
    expect(EQUIVALENT_CASES.map(({ caseId, entry }) => `${caseId}/${entry}`)).toEqual(['cloud-drift/A-cloud-back-opaque.stl', 'sun-cable-bottom/A-sun-back-opaque.stl', 'cloud-sculpted-billow-min/A-cloud-back-opaque.stl']);
    for (const { caseId, entry, reason } of EQUIVALENT_CASES) {
      const listed = getCase(caseId);
      if (!isExported(listed)) throw new Error(`${caseId} has no output`);
      expect(listed.entries?.find((candidate) => candidate.name === entry)?.kind, caseId).toBe('stl');
      expect(reason).toContain('CableClamp.swift:361-363');
    }
  });

  it('an unlisted case stays a mismatch, a listed one passes', () => {
    const reordered = swapTriangles(body(), 0, 1);
    expect(statusLabel(compareCase(c.id, reordered))).toBe('mismatch (topology)');
    const result = compareCase(c.id, reordered, { equivalentCases: list });
    expect(statusLabel(result)).toBe('equivalent');
    expect(result.warnings).toBeUndefined();
  });

  it('a listed case that became `identical` or `ulp` warns "allowlist stale" without failing', () => {
    const same = compareCase(c.id, body(), { equivalentCases: list });
    expect(same.status).toBe('identical');
    expect(same.warnings).toEqual(['allowlist stale: clip-default is identical, remove it from harness/equivalentCases.ts']);
    const moved = bumpVertexEverywhere(body(), 3, 1, 0).bytes;
    const ulp = compareCase(c.id, moved, { equivalentCases: list });
    expect(ulp.status).toBe('ulp');
    expect(ulp.warnings).toEqual(['allowlist stale: clip-default is ulp, remove it from harness/equivalentCases.ts']);
  });

  it('a listed case that is a mismatch is not stale', () => {
    const wrong = copy(body());
    wrong[at(0, 0, 0)] = (wrong[at(0, 0, 0)] as number) ^ 0xff;
    expect(compareCase(c.id, wrong, { equivalentCases: list }).warnings).toBeUndefined();
  });

  describe('for an archive entry', () => {
    const kitCase = getCase('cloud-classic') as ExportedCase;
    const manifestEntries = kitCase.entries as ManifestEntry[];
    const placeholder = stl([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]);
    const kit = (): Uint8Array => storedZipArchive(manifestEntries.map((entry) => [entry.name, loadEntryBody(kitCase, entry) ?? placeholder]));
    const listing = (entry: string) => [{ caseId: kitCase.id, entry, reason: 'test' }];

    it('warns when the entry is identical', () => {
      expect(compareCase(kitCase.id, kit(), { equivalentCases: listing('ASSEMBLY.md') }).warnings).toEqual([
        'allowlist stale: cloud-classic/ASSEMBLY.md is identical, remove it from harness/equivalentCases.ts',
      ]);
    });

    it('not when the entry differs, was skipped or the archive is unreadable', () => {
      expect(compareCase(kitCase.id, kit(), { equivalentCases: listing('A-cloud-back-opaque.stl') }).warnings).toBeUndefined();
      expect(compareCase(kitCase.id, kit(), { equivalentCases: listing('ASSEMBLY.md'), skipEntries: ['ASSEMBLY.md'] }).warnings).toBeUndefined();
      expect(compareCase(kitCase.id, text('not a zip'), { equivalentCases: listing('ASSEMBLY.md') }).warnings).toBeUndefined();
    });
  });

  it('expectReference passes `equivalent`, unless strict, and only warns on a stale entry', () => {
    const reordered = swapTriangles(body(), 0, 1);
    expect(() => expectReference(c.id, reordered)).toThrow(ReferenceMismatchError);
    expect(expectReference(c.id, reordered, { equivalentCases: list }).status).toBe('equivalent');
    expect(() => expectReference(c.id, reordered, { equivalentCases: list, strict: true })).toThrow(ReferenceMismatchError);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(expectReference(c.id, body(), { equivalentCases: list }).status).toBe('identical');
    expect(warn).toHaveBeenCalledWith('allowlist stale: clip-default is identical, remove it from harness/equivalentCases.ts');
  });

  it('the report carries the status, the count and the warnings', () => {
    const rows = [compareCase(c.id, swapTriangles(body(), 0, 1), { equivalentCases: list }), compareCase(c.id, body(), { equivalentCases: list })].map(toRow);
    expect(rows[0]?.label).toBe('equivalent');
    expect(rows[0]?.differingTriangles).toBe(2);
    expect(rows[1]?.warnings.length).toBe(1);
    expect(rows[1]?.note).toContain('allowlist stale');
    expect(formatTable(rows)).toContain('| equivalent |');
    expect(summarize(rows)).toEqual({ identical: 1, ulp: 0, equivalent: 1, mismatch: 0, unverified: 0 });
    const dir = mkdtempSync(join(tmpdir(), 'balloon-report-'));
    try {
      const path = join(dir, 'report.json');
      writeReport(rows, 'stub', path);
      const report = JSON.parse(readFileSync(path, 'utf8')) as { warnings: string[]; rows: { differingTriangles: number }[] };
      expect(report.warnings.length).toBe(1);
      expect(report.rows[0]?.differingTriangles).toBe(2);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
