// compareCase, the manifest, Tier A references, the public API and the report. Everything runs
// without the pack; REFS_PACK_DIR points to nowhere so a local pack cannot change the outcome.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storedZipArchive } from '../src/core/io/storedZip';
import { compareCase, compareCaseError, compareOutput } from './compare';
import { at, bumpVertexEverywhere, copy, resealBstl, stl, text, withBstlHeader } from './fixtures';
import { ReferenceMismatchError, expectNormalized, expectReference, expectReferenceError } from './index';
import { REFERENCES_DIR, allCases, getCase, isExported, isStrictKind, kindOfName, loadManifest, type ExportedCase, type ManifestEntry } from './manifest';
import { hasPack, loadCaseBody, loadEntryBody, packDir, referenceAvailable, sha256Hex } from './refs';
import { DEFAULT_REPORT_PATH, formatTable, summarize, toRow, writeReport } from './report';
import { statusLabel } from './result';

beforeEach(() => {
  vi.stubEnv('REFS_PACK_DIR', '/nonexistent/balloon-pack');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const exported = (id: string): ExportedCase => {
  const c = getCase(id);
  if (!isExported(c)) throw new Error(`${id} has no output`);
  return c;
};
const entryOf = (c: ExportedCase, name: string): ManifestEntry => {
  const entry = c.entries?.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`${c.id} has no ${name}`);
  return entry;
};
const tierACases = allCases().filter(isExported).filter((c) => c.tierA);

/**
 * The Tier B STL with the fewest triangles. What these tests check does not depend on the size,
 * and the largest case (592,712 triangles) took 40 s under parallel load, past the test timeout.
 */
function smallestTierBStl(hasHeader: boolean): ExportedCase {
  const candidates = allCases().filter(isExported).filter((c) => c.kind === 'stl' && !c.tierA && (c.header !== undefined) === hasHeader);
  return candidates.sort((a, b) => (a.triangles as number) - (b.triangles as number))[0] as ExportedCase;
}

/** An STL that satisfies the manifest facts of `c` (its triangle count and bbox) but is not its reference: one record, repeated. */
function factsFixture(c: Pick<ExportedCase, 'bbox' | 'triangles'>): Uint8Array {
  const { min, max } = c.bbox as NonNullable<ExportedCase['bbox']>;
  const count = c.triangles as number;
  const out = new Uint8Array(84 + 50 * count);
  out.set(stl([[min, max, min]]));
  new DataView(out.buffer).setUint32(80, count, true);
  for (let filled = 50; filled < 50 * count; filled *= 2) out.copyWithin(84 + filled, 84, 84 + filled);
  return out;
}

describe('manifest', () => {
  it('has every case with its grid fields', () => {
    const manifest = loadManifest();
    expect(allCases().length).toBe(158);
    expect(manifest.grid.cases).toBe(158);
    expect(getCase('balloon-panel-count-normalization').expect).toEqual({ 'parameters.panels': 16 });
    expect(getCase('basket-partial-settings').expectError).toBe('missing');
    expect(getCase('balloon-classic').parameters).toEqual({});
  });

  it('matches the grid file it was generated from', () => {
    const manifest = loadManifest();
    expect(sha256Hex(readFileSync(new URL(`../../${manifest.grid.path}`, import.meta.url)))).toBe(manifest.grid.sha256);
  });

  it('classifies entries like the exporter', () => {
    for (const c of allCases().filter(isExported)) {
      for (const entry of c.entries ?? []) expect(kindOfName(entry.name), entry.name).toBe(entry.kind);
    }
    expect(['stl', 'zip', '3mf', 'model'].map((kind) => isStrictKind(kind as 'stl'))).toEqual([false, false, false, false]);
    expect(['json', 'text', 'svg'].map((kind) => isStrictKind(kind as 'json'))).toEqual([true, true, true]);
  });

  it('rejects an unknown id', () => {
    expect(() => getCase('no-such-case')).toThrow(/Unknown reference case/);
  });
});

describe('Tier A references', () => {
  it('every Tier A body exists and hashes to its manifest value', () => {
    let bodies = 0;
    for (const c of allCases().filter(isExported)) {
      if (c.tierA) {
        expect(loadCaseBody(c)?.length, c.id).toBe(c.bytes);
        bodies++;
      }
      for (const entry of c.entries ?? []) {
        if (entry.tierA) {
          expect(loadEntryBody(c, entry)?.length, `${c.id}/${entry.name}`).toBe(entry.bytes);
          bodies++;
        }
      }
    }
    expect(bodies).toBeGreaterThan(19);
  });

  it('the 19 clip cases against themselves are identical', () => {
    const clips = allCases().filter((c) => c.id.startsWith('clip-'));
    expect(clips.length).toBe(19);
    for (const c of clips) {
      if (!isExported(c)) throw new Error(`${c.id} has no output`);
      expect(statusLabel(compareCase(c.id, loadCaseBody(c) as Uint8Array)), c.id).toBe('identical');
    }
    expect(tierACases.map((c) => c.id).sort()).toEqual(clips.map((c) => c.id).sort());
  });

  it('a kit ASSEMBLY.md with one changed character is a mismatch with a diff', () => {
    const c = exported('cloud-classic');
    const original = loadEntryBody(c, entryOf(c, 'ASSEMBLY.md')) as Uint8Array;
    const changed = copy(original);
    const at = changed.indexOf(0x4b); // the first capital K
    changed[at] = 0x4a;
    const result = compareOutput(original, changed, 'text');
    expect(statusLabel(result)).toBe('mismatch (text)');
    expect(result.notes[0]).toContain(`First difference at byte ${at}`);
    expect(result.notes[1]).toMatch(/^--- swift\n\+\+\+ ts\n@@ /);
    expect(result.notes[1]).toMatch(/\n-.*K/);
    expect(result.notes[1]).toMatch(/\n\+.*J/);
  });

  it('a real clip with one vertex moved everywhere is `ulp`', () => {
    const c = exported('clip-default');
    const moved = bumpVertexEverywhere(loadCaseBody(c) as Uint8Array, 3, 1, 0);
    const result = compareCase(c.id, moved.bytes, { tsMs: 7 });
    expect(statusLabel(result)).toBe('ulp');
    expect(result.ulpCount).toBe(moved.occurrences);
    expect(result.tsMs).toBe(7);
    expect(result.swiftMs).toBe(c.durationMs);
  });

  it('a corrupt pack throws instead of looking like a port bug', () => {
    const c = exported('cloud-classic');
    const dir = mkdtempSync(join(tmpdir(), 'balloon-pack-'));
    try {
      mkdirSync(join(dir, 'files', c.id), { recursive: true });
      writeFileSync(join(dir, 'files', c.id, c.filename), 'not the archive');
      vi.stubEnv('REFS_PACK_DIR', dir);
      expect(hasPack()).toBe(true);
      expect(referenceAvailable(c)).toBe(true);
      expect(() => loadCaseBody(c)).toThrow(/Corrupt reference/);
      expect(() => loadEntryBody(c, entryOf(c, 'A-cloud-back-opaque.stl'))).toThrow(/Corrupt reference/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe('without the pack', () => {
  it('uses the default location unless REFS_PACK_DIR is set', () => {
    expect(hasPack()).toBe(false);
    expect(packDir()).toBe('/nonexistent/balloon-pack/');
    vi.stubEnv('REFS_PACK_DIR', '');
    expect(packDir()).toBe(`${REFERENCES_DIR}pack/refs-v1/`);
  });

  it('a differing STL that only the pack could settle is `unverified-needs-pack`', () => {
    const c = smallestTierBStl(false);
    expect(referenceAvailable(c)).toBe(false);
    expect(loadCaseBody(c)).toBeNull();
    const result = compareCase(c.id, factsFixture(c));
    expect(statusLabel(result)).toBe('unverified-needs-pack');
    expect(result.status).toBe('unverified');
  });

  it('what the manifest disproves is a mismatch even so', () => {
    const c = allCases().filter(isExported).find((candidate) => candidate.kind === 'stl' && !candidate.tierA) as ExportedCase;
    expect(statusLabel(compareCase(c.id, stl([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]])))).toBe('mismatch (triangle count)');
  });

  it('a BSTL header is checked against the manifest', () => {
    const c = smallestTierBStl(true);
    const triangles = stl([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]);
    expect(compareCase(c.id, resealBstl(withBstlHeader(triangles))).tags).toEqual(['triangle count']);
    const right = factsFixture(c);
    const header = Uint8Array.from((c.header as string).match(/../g) as string[], (pair) => parseInt(pair, 16));
    const sameHeader = copy(right);
    sameHeader.set(header);
    expect(statusLabel(compareCase(c.id, resealBstl(sameHeader)))).toBe('unverified-needs-pack');
    expect(statusLabel(compareCase(c.id, sameHeader))).toBe('mismatch (digest)');
    expect(statusLabel(compareCase(c.id, withBstlHeader(right)))).toBe('mismatch (header)');
  });

  describe('a kit', () => {
    const c = exported('cloud-classic');
    const entries = c.entries as ManifestEntry[];
    /** Tier A entries as they are, placeholders for what only the pack has. */
    const kit = (replace: Record<string, Uint8Array> = {}) =>
      storedZipArchive(entries.map((entry) => [entry.name, replace[entry.name] ?? loadEntryBody(c, entry) ?? stl([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]])]));
    const assembly = loadEntryBody(c, entryOf(c, 'ASSEMBLY.md')) as Uint8Array;
    const large = entries.filter((entry) => !entry.tierA);
    /** Placeholders for the Tier B parts that satisfy their manifest facts. */
    const plausible = (): Record<string, Uint8Array> =>
      Object.fromEntries(large.map((entry) => [entry.name, factsFixture(entry)]));

    it('with Tier B entries that differ is `unverified-needs-pack` when their facts hold', () => {
      expect(large.length).toBeGreaterThan(0);
      const result = compareCase(c.id, kit(plausible()));
      expect(statusLabel(result)).toBe('unverified-needs-pack');
      expect(result.entries?.map((entry) => entry.name)).toEqual(large.map((entry) => entry.name));
    });

    it('with a wrong Tier A entry is a mismatch, which outranks the unverified ones', () => {
      const changed = copy(assembly);
      changed[0] = 0x20;
      const result = compareCase(c.id, kit({ ...plausible(), 'ASSEMBLY.md': changed }));
      expect(statusLabel(result)).toBe('mismatch (text)');
      expect(result.notes[0]).toContain('ASSEMBLY.md');
      expect(result.entries?.filter((entry) => entry.status === 'unverified').length).toBe(large.length);
    });

    it('with another entry name is a mismatch', () => {
      const renamed = storedZipArchive(entries.map((entry, i) => [i === 0 ? 'other.stl' : entry.name, assembly]));
      expect(statusLabel(compareCase(c.id, renamed))).toBe('mismatch (zip)');
    });

    it('with identical entries in a bad container is a mismatch', () => {
      const archive = kit();
      const view = new DataView(archive.buffer);
      view.setUint16(12, 34, true); // local date of the first entry
      const result = compareCase(c.id, archive);
      expect(result.tags).toContain('zip');
      expect(result.notes[0]).toContain('localDate 34 vs 33');
    });
  });
});

describe('error cases', () => {
  const c = getCase('basket-partial-settings');

  it('the same text passes, in any wrapper', () => {
    expect(c.error).toBe('The data couldn’t be read because it is missing.');
    expect(compareCaseError(c.id, new Error('The data couldn’t be read because it is missing.')).status).toBe('identical');
    expect(compareCaseError(c.id, { code: 'invalid-settings', message: 'it is missing here' }).status).toBe('identical');
  });

  it('another text fails', () => {
    const result = compareCaseError(c.id, new Error('The data couldn’t be read because it isn’t in the correct format.'));
    expect(statusLabel(result)).toBe('mismatch (error text)');
  });

  it('no error where Swift fails, and an error where Swift does not', () => {
    expect(statusLabel(compareCase(c.id, text('x')))).toBe('mismatch (expected error)');
    expect(statusLabel(compareCaseError('clip-default', new Error('boom')))).toBe('mismatch (unexpected error)');
  });

  it('expectReferenceError throws only on a wrong text', () => {
    expect(expectReferenceError(c.id, new Error('it is missing')).status).toBe('identical');
    expect(() => expectReferenceError(c.id, new Error('other'))).toThrow(ReferenceMismatchError);
  });
});

describe('expectReference', () => {
  const c = exported('clip-default');
  const body = () => loadCaseBody(c) as Uint8Array;
  const tierB = smallestTierBStl(false);

  it('passes on identical and ulp, returning the result', () => {
    expect(expectReference(c.id, body()).status).toBe('identical');
    const moved = bumpVertexEverywhere(body(), 3, 1, 0);
    expect(expectReference(c.id, moved.bytes).ulpCount).toBe(moved.occurrences);
  });

  it('with strict, ulp fails', () => {
    const moved = bumpVertexEverywhere(body(), 3, 1, 0);
    expect(() => expectReference(c.id, moved.bytes, { strict: true })).toThrow(ReferenceMismatchError);
    expect(expectReference(c.id, body(), { strict: true }).status).toBe('identical');
  });

  it('a mismatch throws with the table row and the notes', () => {
    const wrong = copy(body());
    wrong[at(0, 0, 0)] = (wrong[at(0, 0, 0)] as number) ^ 0xff;
    let thrown: unknown;
    try {
      expectReference(c.id, wrong);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReferenceMismatchError);
    const error = thrown as ReferenceMismatchError;
    expect(error.result.status).toBe('mismatch');
    expect(error.message).toContain('clip-default: mismatch');
    expect(error.message).toContain('id ');
    expect(error.message).toContain('| maxUlp |');
  });

  it('unverified warns locally and fails on CI, unless allowed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bytes = factsFixture(tierB);
    vi.stubEnv('CI', '');
    expect(expectReference(tierB.id, bytes).status).toBe('unverified');
    expect(warn).toHaveBeenCalledOnce();
    vi.stubEnv('CI', 'true');
    expect(() => expectReference(tierB.id, bytes)).toThrow(ReferenceMismatchError);
    expect(expectReference(tierB.id, bytes, { allowUnverified: true }).status).toBe('unverified');
  });

  it('expectNormalized compares byte for byte and names the path', () => {
    expectNormalized(c.id, c.normalized);
    expect(() => expectNormalized(c.id, c.normalized.replace('"cableDiameter":3.75', '"cableDiameter":3.5'))).toThrow(/\$\.cableDiameter: different value \(port bug\): 3\.5 vs 3\.75/);
    const pattern = exported('pattern-stripes');
    expectNormalized(pattern.id, pattern.normalizedPattern as string, 'pattern');
    expectNormalized(pattern.id, pattern.normalizedPurge as string, 'purge');
    expect(() => expectNormalized(c.id, '{}', 'pattern')).toThrow(/no normalized pattern/);
    expect(() => expectNormalized('basket-partial-settings', '{}')).toThrow(/its export fails/);
  });
});

describe('report', () => {
  const results = [
    compareCase('clip-default', loadCaseBody(exported('clip-default')) as Uint8Array, { tsMs: 12.4 }),
    compareCaseError('clip-default', new Error('boom')),
  ];

  it('prints one table row per case', () => {
    const table = formatTable(results.map(toRow)).split('\n');
    expect(table[0]).toMatch(/^id +\| status +\| maxUlp \| ulpCount \| tsMs \| swiftMs \| note$/);
    expect(table[2]).toMatch(/^clip-default \| identical +\| 0 +\| 0 +\| 12 +\| \d+ +\|$/);
    expect(table[3]).toContain('mismatch (unexpected error)');
    expect(table[3]).toContain('boom');
  });

  it('writes the JSON file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'balloon-report-'));
    try {
      const path = join(dir, 'nested', 'report.json');
      writeReport(results.map(toRow), 'stub', path);
      const report = JSON.parse(readFileSync(path, 'utf8')) as { implementation: string; release: string; summary: Record<string, number>; rows: { id: string }[] };
      expect(report.implementation).toBe('stub');
      expect(report.release).toBe('refs-v1');
      expect(report.summary).toEqual({ identical: 1, ulp: 0, equivalent: 0, mismatch: 1, unverified: 0 });
      expect(report.rows.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true });
    }
    expect(DEFAULT_REPORT_PATH.endsWith('references/report.json')).toBe(true);
    expect(summarize([])).toEqual({ identical: 0, ulp: 0, equivalent: 0, mismatch: 0, unverified: 0 });
  });
});
