// Tier B: real STLs, kits and 3MFs from the pack, against themselves and manipulated copies.
// Skipped without the pack (bash mac/scripts/fetch-pack.sh).
import { describe, expect, it } from 'vitest';
import { storedZipArchive } from '../src/core/io/storedZip';
import { zipEntries } from '../src/core/testing/zipReader';
import { compareCase, compareOutput } from './compare';
import { EQUIVALENT_CASES } from './equivalentCases';
import { bumpVertexEverywhere, copy, resealBstl, swapTriangles } from './fixtures';
import { allCases, getCase, isExported, type ExportedCase, type ManifestEntry } from './manifest';
import { hasPack, loadCaseBody, loadEntryBody, sha256Hex } from './refs';
import { statusLabel } from './result';
import { stlFactsProblem } from './stlDiff';

const exported = (id: string): ExportedCase => {
  const c = getCase(id);
  if (!isExported(c)) throw new Error(`${id} has no output`);
  return c;
};
const reference = (c: ExportedCase): Uint8Array => loadCaseBody(c) as Uint8Array;
const rebuilt = (archive: Uint8Array, replace: (name: string, bytes: Uint8Array) => Uint8Array): Uint8Array =>
  storedZipArchive(zipEntries(archive).map((entry) => [entry.name, replace(entry.name, entry.data)]));
const TIMEOUT = 120_000;

describe.skipIf(!hasPack())('reference pack', () => {
  it('every entry cut out of its archive hashes to the manifest value', () => {
    let entries = 0;
    for (const c of allCases().filter(isExported)) {
      if (c.kind !== 'zip') continue;
      for (const entry of c.entries as ManifestEntry[]) {
        expect(loadEntryBody(c, { ...entry, tierA: false })?.length, `${c.id}/${entry.name}`).toBe(entry.bytes);
        entries++;
      }
    }
    expect(entries).toBeGreaterThan(300);
  }, TIMEOUT);

  it('the manifest facts hold for every reference STL', () => {
    let files = 0;
    for (const c of allCases().filter(isExported)) {
      if (c.kind === 'stl') {
        expect(stlFactsProblem(c, reference(c)), c.id).toBeNull();
        files++;
      } else if (c.kind === 'zip') {
        for (const entry of c.entries as ManifestEntry[]) {
          if (entry.kind !== 'stl') continue;
          expect(stlFactsProblem(entry, loadEntryBody(c, entry) as Uint8Array), `${c.id}/${entry.name}`).toBeNull();
          files++;
        }
      }
    }
    expect(files).toBe(67 + 261);
  }, TIMEOUT);

  it('a BSTL balloon: identical, an ULP with a resealed digest, an ULP with a stale one', () => {
    const c = exported('balloon-hanger-small');
    const body = reference(c);
    expect(compareCase(c.id, body).status).toBe('identical');
    const moved = bumpVertexEverywhere(body, 100, 1, 0); // x, not z: this z is 0, which the near-zero rule takes
    const result = compareCase(c.id, resealBstl(moved.bytes));
    expect(statusLabel(result)).toBe('ulp');
    expect(result.ulpCount).toBe(moved.occurrences);
    expect(statusLabel(compareCase(c.id, moved.bytes))).toBe('mismatch (digest)');
  }, TIMEOUT);

  it('a kit: identical, an ULP in one part, a changed setting, a damaged container', () => {
    const c = exported('cloud-classic');
    const archive = reference(c);
    expect(compareCase(c.id, archive).status).toBe('identical');

    const name = 'B-cloud-front-white-PLA.stl';
    const moved = bumpVertexEverywhere(loadEntryBody(c, (c.entries as ManifestEntry[]).find((entry) => entry.name === name) as ManifestEntry) as Uint8Array, 50, 2, 0);
    const ulp = compareCase(c.id, rebuilt(archive, (entry, bytes) => (entry === name ? moved.bytes : bytes)));
    expect(statusLabel(ulp)).toBe('ulp');
    expect(ulp.ulpCount).toBe(moved.occurrences);
    expect(ulp.entries?.map((entry) => entry.name)).toEqual([name]);

    const settings = compareCase(c.id, rebuilt(archive, (entry, bytes) => (entry === 'cloud-settings.json' ? new TextEncoder().encode(new TextDecoder().decode(bytes).replace('"width":230', '"width":231')) : bytes)));
    expect(statusLabel(settings)).toBe('mismatch (json)');
    expect(settings.notes[0]).toContain('$.width: different value (port bug): 231 vs 230');

    const damaged = copy(archive);
    new DataView(damaged.buffer).setUint16(12, 34, true);
    expect(statusLabel(compareCase(c.id, damaged))).toBe('mismatch (zip)');
  }, TIMEOUT);

  it('a 3MF: identical, a last digit in the model, another paint color', () => {
    const c = exported('pattern-stripes-24-rigged');
    const archive = reference(c);
    expect(compareCase(c.id, archive).status).toBe('identical');

    const edit = (change: (model: string) => string) =>
      rebuilt(archive, (entry, bytes) => (entry === '3D/3dmodel.model' ? new TextEncoder().encode(change(new TextDecoder().decode(bytes))) : bytes));
    const ulp = compareCase(c.id, edit((model) => model.replace('x="15.805242189705986"', 'x="15.805242189705988"')));
    expect(statusLabel(ulp)).toBe('ulp');
    expect(ulp.ulpCount).toBe(1);
    expect(ulp.entries?.[0]?.notes[0]).toMatch(/^\d+\/\d+ vertex lines text-equal/);

    const painted = compareCase(c.id, edit((model) => model.replace('paint_color="4"', 'paint_color="8"')));
    expect(statusLabel(painted)).toBe('mismatch (triangle)');
  }, TIMEOUT);

  it('the listed clamp entries are valid meshes and reordered copies of them pass', () => {
    for (const { caseId, entry } of EQUIVALENT_CASES) {
      const c = exported(caseId);
      const manifestEntry = (c.entries as ManifestEntry[]).find((candidate) => candidate.name === entry) as ManifestEntry;
      const body = loadEntryBody(c, manifestEntry) as Uint8Array;
      const result = compareOutput(body, swapTriangles(body, 0, 1), 'stl', { allowEquivalent: () => true });
      expect(statusLabel(result), `${caseId}/${entry}`).toBe('equivalent');
      expect(result.differingTriangles).toBe(2);
    }
  }, TIMEOUT);

  it('a listed model and a listed front are valid meshes and pass when moved a little', () => {
    const model = exported('text-sans-hello');
    const archive = reference(model);
    const nudged = rebuilt(archive, (entry, bytes) => {
      if (entry !== '3D/3dmodel.model') return bytes;
      // A shift far beyond the model tolerance, far within the entry's limit.
      return new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/<vertex x="(-?[\d.]+)"/g, (tag, x: string) => `<vertex x="${Number(x) + 1e-9}"`));
    });
    const result = compareCase(model.id, nudged);
    expect(statusLabel(result)).toBe('equivalent-bounded');
    expect(result.entries?.map((entry) => entry.name)).toEqual(['3D/3dmodel.model']);

    const kit = exported('cloud-sculpted-classic');
    const name = 'B-cloud-front-white-PLA.stl';
    const front = loadEntryBody(kit, (kit.entries as ManifestEntry[]).find((entry) => entry.name === name) as ManifestEntry) as Uint8Array;
    let moved = front;
    for (let i = 0; i < 2; i++) moved = bumpVertexEverywhere(moved, 50, 2, 0).bytes;
    const kitResult = compareCase(kit.id, rebuilt(reference(kit), (entry, bytes) => (entry === name ? moved : bytes)));
    expect(statusLabel(kitResult)).toBe('equivalent-bounded');
    expect(kitResult.bounded).toBeUndefined();
    expect(kitResult.entries?.[0]?.bounded?.verticesWithoutPartner).toBe(2);
  }, TIMEOUT);

  it('the largest model compares in reasonable time', () => {
    const c = allCases().filter(isExported).filter((candidate) => candidate.kind === '3mf').sort((a, b) => b.bytes - a.bytes)[0] as ExportedCase;
    const archive = reference(c);
    const started = performance.now();
    const edited = rebuilt(archive, (entry, bytes) => {
      if (entry !== '3D/3dmodel.model') return bytes;
      const out = copy(bytes);
      const last = out.lastIndexOf(0x20 /* space before the paint color of the last triangle */);
      out[last - 1] = out[last - 1] === 0x30 ? 0x31 : 0x30;
      return out;
    });
    expect(sha256Hex(edited)).not.toBe(c.sha256);
    const result = compareOutput(archive, edited, '3mf');
    expect(result.status).toBe('mismatch');
    console.log(`${c.id}: ${c.bytes} bytes compared in ${Math.round(performance.now() - started)} ms`);
  }, TIMEOUT);
});
