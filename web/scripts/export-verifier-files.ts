// Writes what mac/scripts/verify-cloud-blender.py and verify-cable-clip-blender.py read (plan §10
// step 7), from the real core, through the same export the page calls: unpacked kits, and next to
// them the test-only seated-*.stl files that mac/Tests write to .build/test-output. docs/acceptance.md
// has the commands. Bundled like bench/budgets.ts, because the core's imports need the real-core condition:
//   npx vite build --config bench/vite.config.ts --ssr scripts/export-verifier-files.ts --outDir node_modules/.verifier
//   node node_modules/.verifier/export-verifier-files.js <folder>
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { core } from '#core';
import { exportedFile, prepareCase } from '../harness/exportCase';
import { isExported, type ReferenceCase } from '../harness/manifest';
import { CableClipGenerator, CableClipKit } from '../src/core/clip/cableClip';
import { binarySTL } from '../src/core/io/binaryStl';
import { CloudKit } from '../src/core/lamp/cloudKit';
import { zipEntries } from '../src/core/testing/zipReader';

const out = resolve(process.argv[2] ?? 'verifier-files');
// The bundle runs from web/node_modules/.verifier.
const root = new URL('../../../', import.meta.url);
const readJSON = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T;
const manifest = readJSON<{ cases: ReferenceCase[] }>('references/manifest.json');
const grid = readJSON<{ cases: (Partial<ReferenceCase> & { id: string })[] }>('mac/cases/grid.json');
const caseOf = (id: string): ReferenceCase => {
  const c = manifest.cases.find((x) => x.id === id);
  if (c === undefined) throw new Error(`No case ${id}`);
  return { ...c, ...grid.cases.find((x) => x.id === id) } as ReferenceCase;
};

const againstManifest = (c: ReferenceCase, bytes: Uint8Array): string =>
  isExported(c) && createHash('sha256').update(bytes).digest('hex') === c.sha256 ? 'SHA-256 equals the manifest' : 'SHA-256 differs from the manifest (the harness report has its status)';
const folder = (name: string): string => {
  const path = join(out, name);
  mkdirSync(path, { recursive: true });
  return path;
};

/** The kit as the page exports it, unpacked. Returns the settings the kit was made from. */
function unpackKit(id: string, name = id): { path: string; parameters: Parameters<typeof core.cloud.normalize>[0] } {
  const c = caseOf(id);
  const file = exportedFile(prepareCase(core, c).run());
  const path = folder(name);
  for (const entry of zipEntries(file.bytes)) writeFileSync(join(path, entry.name), entry.data);
  console.log(`${name}: ${file.name}, ${againstManifest(c, file.bytes)}`);
  return { path, parameters: core.cloud.normalize({ ...core.cloud.codec.decodeValue(c.parameters ?? {}), kind: c.part === 'sun' ? 'sun' : 'cloud' }) };
}

// As the tests write them: CableClampTests.swift:292-298, NailInsertTests.swift:119-122.
function addSeatedClamp(id: string): void {
  const { path, parameters } = unpackKit(id, `${id}-seated`);
  const kit = new CloudKit(parameters, 'export');
  const [anvil, bar] = kit.placedClamp();
  if (anvil === undefined || bar === undefined) throw new Error(`${id} has no strain relief`);
  writeFileSync(join(path, 'seated-seal.stl'), binarySTL(kit.placedSeal()));
  writeFileSync(join(path, 'seated-anvil.stl'), binarySTL(anvil));
  writeFileSync(join(path, 'seated-bar.stl'), binarySTL(bar));
}

function addSeatedInsert(id: string): void {
  const { path, parameters } = unpackKit(id, `${id}-seated`);
  const [insert] = new CloudKit(parameters, 'export').placedInsert();
  if (insert === undefined) throw new Error(`${id} has no slot insert`);
  writeFileSync(join(path, 'seated-insert.stl'), binarySTL(insert));
}

// The default kits, then every kit on the allowlists of harness/equivalentCases.ts that a verifier can read.
for (const id of ['cloud-classic', 'sun-soft-star', 'cloud-drift', 'sun-cable-bottom', 'cloud-sculpted-classic', 'cloud-sculpted-billow-min']) unpackKit(id);
for (const id of ['cloud-classic', 'sun-soft-star']) addSeatedClamp(id);
for (const id of ['cloud-nail-insert', 'sun-nail-insert']) addSeatedInsert(id);

// As CableClipTests.swift:185-189 writes the default clip.
const c = caseOf('clip-default');
const file = exportedFile(prepareCase(core, c).run());
const clipFolder = folder('clip-default');
const p = core.clip.normalize(core.clip.codec.decodeValue(c.parameters ?? {}));
const kit = CableClipKit.generate(p, 'export');
writeFileSync(join(clipFolder, file.name), file.bytes);
writeFileSync(join(clipFolder, 'seated-clip.stl'), binarySTL(kit.mesh));
writeFileSync(join(clipFolder, 'seated-cable.stl'), binarySTL(CableClipGenerator.rod(-12, 12, p.cableDiameter / 2 - 0.01, kit.clip.center)));
writeFileSync(join(clipFolder, 'cable-clip-settings.json'), core.clip.codec.encode(p));
console.log(`clip-default: ${file.name}, ${againstManifest(c, file.bytes)}`);
