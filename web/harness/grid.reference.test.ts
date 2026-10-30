// The whole grid through the CoreApi. `npm run test:reference` with VITE_CORE=real compares every
// case with its Swift reference and writes references/report.json. With the stub core (`npm test`)
// the geometry is placeholder, so only the structure runs: every case decodes and exports one file.
//
// REFS_CASES=clip-*,cloud-classic  only these ids (* is a wildcard)
// REFS_SHARD=2/4                   the second of four parts of the selection
import { core } from '#core';
import { afterAll, describe, expect, it } from 'vitest';
import { compareCase, compareCaseError, type CaseResult } from './compare';
import { exportedFile, prepareCase } from './exportCase';
import { describeResult } from './index';
import { allCases, isExported, loadManifest, type ReferenceCase } from './manifest';
import { formatTable, skippedRow, summarize, toRow, writeReport } from './report';
import { skippedBy, skippedEntries } from './skipList';

/** What depends on the rasterizer: plan §1 exempts it from the byte criterion, WP-R checks it by tolerances. */
const RASTER_ENTRIES = ['3D/3dmodel.model', 'Metadata/balloon-studio.txt'];

function selectCases(): ReferenceCase[] {
  const patterns = (process.env['REFS_CASES'] ?? '').split(',').filter((pattern) => pattern !== '');
  const matchers = patterns.map((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
  const chosen = allCases().filter((c) => matchers.length === 0 || matchers.some((matcher) => matcher.test(c.id)));
  const shard = /^(\d+)\/(\d+)$/.exec(process.env['REFS_SHARD'] ?? '');
  if (shard === null) return chosen;
  const part = Number(shard[1]);
  const parts = Number(shard[2]);
  return chosen.filter((_, i) => i % parts === part - 1);
}

const cases = selectCases();
const isReal = core.implementation === 'real';

describe.skipIf(isReal)('grid structure (stub core)', () => {
  it('covers the grid the manifest was generated from', () => {
    expect(allCases().length).toBe(loadManifest().grid.cases);
  });

  it.each(cases.filter(isExported).map((c) => [c.id, c] as const))('%s exports one file', (_, c) => {
    const settings = prepareCase(core, c);
    expect(settings.normalized.startsWith('{')).toBe(true);
    // The stub keeps the app's block; core/real has to honor `ignoreExportProblem` (exportCase.ts).
    if (c.notes?.appExportDisabled === true) {
      expect(() => settings.run()).toThrow(c.notes.problem as string);
      return;
    }
    const file = exportedFile(settings.run());
    expect(file.bytes.length).toBeGreaterThan(0);
  });

  it('a case that fails in Swift fails while decoding', () => {
    const failing = cases.filter((c) => !isExported(c));
    expect(failing.map((c) => c.id)).toEqual(['basket-partial-settings']);
    for (const c of failing) expect(() => prepareCase(core, c).run()).toThrow();
  });
});

describe.skipIf(!isReal)('grid against the Swift references', () => {
  const results: CaseResult[] = [];
  const compared = cases.filter((c) => skippedBy(c) === null);

  afterAll(() => {
    const skipped = cases.flatMap((c) => {
      const by = skippedBy(c);
      return by === null ? [] : [skippedRow(c.id, by, c.durationMs)];
    });
    const rows = [...results.map(toRow), ...skipped];
    console.log(formatTable(rows));
    console.log(JSON.stringify(summarize(rows)));
    writeReport(rows, core.implementation);
  });

  it.each(compared.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const started = performance.now();
    let result: CaseResult;
    try {
      const settings = prepareCase(core, c);
      if (isExported(c)) {
        expect(settings.normalized, 'normalized parameters').toBe(c.normalized);
        if (c.normalizedPattern !== undefined) expect(settings.normalizedPattern, 'normalized pattern').toBe(c.normalizedPattern);
        if (c.normalizedPurge !== undefined) expect(settings.normalizedPurge, 'normalized purge').toBe(c.normalizedPurge);
      }
      const exported = settings.run();
      const file = exportedFile(exported);
      const tsMs = performance.now() - started;
      if (isExported(c)) expect(exported.filename, 'filename').toBe(c.filename);
      const skipEntries = [...(c.group === 'identity' ? [] : RASTER_ENTRIES), ...skippedEntries(c)];
      result = compareCase(id, file.bytes, { tsMs, ...(skipEntries.length === 0 ? {} : { skipEntries }) });
    } catch (error) {
      // Right for the case Swift fails on; a mismatch row with the message for all others.
      result = compareCaseError(id, error, { tsMs: performance.now() - started });
    }
    results.push(result);
    // Fails on mismatch and unverified; JSON, text and SVG have no `ulp` state, they are strict by construction.
    if (result.status === 'mismatch' || result.status === 'unverified') throw new Error(describeResult(result));
  });
});
