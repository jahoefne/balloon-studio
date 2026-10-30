// The parameter half of the lamp references (WP-K4a): every cloud and sun case of the manifest,
// decoded the exporter's way, must normalize to the same JSON and the same kit name.
import { describe, expect, it } from 'vitest';
import { encodeCloudParameters, filename, normalized } from '../src/core/lamp/cloudGeometry';
import { wallLampDefaults } from '../src/core/lamp/sunGeometry';
import { decodedCase, lampCases } from './support/lamp';

const cases = lampCases();

describe('lamp cases of the reference manifest', () => {
  it('has the 29 cloud and 12 sun cases', () => {
    expect(cases.filter((c) => c.manifest.part === 'cloud').length).toBe(29);
    expect(cases.filter((c) => c.manifest.part === 'sun').length).toBe(12);
  });

  it.each(cases.map((c) => [c.manifest.id, c] as const))('%s: normalized and filename', (_id, c) => {
    const p = normalized(decodedCase(c.grid, wallLampDefaults));
    expect(encodeCloudParameters(p)).toBe(c.manifest.normalized);
    expect(filename(p)).toBe(c.manifest.filename);
    // Normalizing what was normalized changes nothing.
    expect(encodeCloudParameters(normalized(p))).toBe(c.manifest.normalized);
  });

  it('meets the expectations the grid states', () => {
    for (const c of cases) {
      const fields = JSON.parse(c.manifest.normalized) as Record<string, unknown>;
      for (const [path, value] of Object.entries(c.grid.expect ?? {})) {
        expect(fields[path.replace('parameters.', '')], `${c.manifest.id}: ${path}`).toBe(value);
      }
    }
  });
});
