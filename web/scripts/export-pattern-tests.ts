// `npm run export-pattern-tests`: the end-to-end check of plan §7. Exports the classic balloon with the
// default settings of each multicolor pattern through the real core, like PatternTests.swift:41 and
// NightFlightTests.swift:71, into web/.build/pattern-tests/. The unchanged mac/scripts/verify-3mf.py runs
// on them from web/, as test-patterns.sh runs it from mac/; it opens all seven files, not only the
// three that need fonts or artwork.
//
// Then prints each file's SHA-256 next to the grid case with the same settings. Those cases are
// preview quality, so the same request at preview quality is compared with them too: everything but
// the raster-dependent entries must be byte-identical, and the harness judges the rest (`npm run test:reference`).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { core } from '#core';
import { zipEntries } from '../src/core/testing/zipReader';
import type { BalloonPattern } from '../src/core/types';

// The bundle runs from web/node_modules/.bench.
const web = new URL('../../', import.meta.url);
const repo = new URL('../', web);

interface Output {
  name: string;
  style: BalloonPattern;
  /** The grid case with these settings, where one exists at the default size. */
  gridCase: string;
}

const OUTPUTS: readonly Output[] = [
  { name: 'stripes', style: 'Horizontal stripes', gridCase: 'pattern-stripes' },
  { name: 'hearts', style: 'Hearts', gridCase: 'pattern-hearts' },
  { name: 'dots', style: 'Polka dots', gridCase: 'pattern-dots' },
  { name: 'diamonds', style: 'Diamonds', gridCase: 'pattern-diamonds' },
  { name: 'text', style: 'Text', gridCase: 'text-rounded-hello' },
  { name: 'night-flight', style: 'Night Flight', gridCase: 'relief-night-flight-classic' },
  { name: 'summit-cable-car', style: 'Summit Cable Car', gridCase: 'relief-summit-classic' },
];

interface ManifestEntry {
  name: string;
  sha256: string;
}
interface ManifestCase {
  id: string;
  quality: string;
  sha256: string;
  entries: ManifestEntry[];
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const manifest = JSON.parse(readFileSync(new URL('references/manifest.json', repo), 'utf8')) as { cases: ManifestCase[] };
const manifestCase = (id: string): ManifestCase => {
  const found = manifest.cases.find((c) => c.id === id);
  if (found === undefined) throw new Error(`No case ${id}`);
  return found;
};

await core.prepare(async (file) => new Uint8Array(readFileSync(new URL(`public/fonts/${file}`, web))));

const out = new URL('.build/pattern-tests/', web);
mkdirSync(out, { recursive: true });

const api = core.balloon;
const parameters = api.normalize(api.presets.classic);
const purge = api.purge.defaults;

for (const { name, style, gridCase } of OUTPUTS) {
  const snapshot = { parameters, pattern: api.pattern.normalize({ ...api.pattern.defaults, style }, parameters), purge };
  const started = performance.now();
  const exported = api.export(snapshot).files[0];
  if (exported === undefined) throw new Error(`${name}: nothing exported`);
  writeFileSync(new URL(`${name}.3mf`, out), exported.bytes);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  const reference = manifestCase(gridCase);
  const exportHash = sha256(exported.bytes);
  const atQuality = reference.quality === 'export' ? exported : api.export(snapshot, { quality: 'preview' }).files[0];
  if (atQuality === undefined) throw new Error(`${name}: nothing exported at preview quality`);
  const differing = zipEntries(atQuality.bytes)
    .filter((entry) => sha256(entry.data) !== reference.entries.find((e) => e.name === entry.name)?.sha256)
    .map((entry) => entry.name);

  console.log(`${name}.3mf  ${exported.bytes.length} bytes, ${seconds} s, as ${exported.name}`);
  console.log(`  sha256 export   ${exportHash}`);
  console.log(`  case            ${gridCase} (${reference.quality})`);
  console.log(`  sha256 ${reference.quality.padEnd(8)} ${sha256(atQuality.bytes)}`);
  console.log(`  sha256 manifest ${reference.sha256}`);
  console.log(`  entries that differ from the manifest: ${differing.length === 0 ? 'none' : differing.join(', ')}`);
}
