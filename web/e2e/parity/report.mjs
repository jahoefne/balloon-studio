// Writes docs/parity-checklist.md from the two parity runs (.results/parity-{stub,real}.json):
// finds each row's Swift and web line by its literal and sets the status. A literal that is not
// in the Swift source fails the run, so the document cannot point at text the Mac app lacks.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', '..');
const repo = join(web, '..');
const results = join(here, '..', '.results');
const swiftDir = join(repo, 'mac', 'Sources', 'BalloonStudio');

const SWIFT_BY_PART = {
  'App shell': ['BalloonStudioApp', 'STLImportView'],
  Balloon: ['BalloonStudioApp', 'BalloonGeometry'],
  'Balloon · Pattern': ['PatternEditor', 'BalloonStudioApp', 'BalloonPatterns'],
  Basket: ['BasketEditor', 'BasketGeometry'],
  Ring: ['RingEditor', 'RingGeometry', 'LEDReflectorDiagram'],
  Cloud: ['CloudEditor', 'CloudGeometry', 'SunGeometry'],
  Sun: ['CloudEditor', 'SunGeometry', 'CloudGeometry'],
  Figures: ['FigureEditor', 'FigureGeometry'],
  'Cable clip': ['CableClipEditor', 'CableClip'],
};
const WEB_BY_PART = {
  'App shell': ['src/app', 'src/open', 'src/ui', 'src/stores', 'src/persistence'],
  Balloon: ['src/editors/balloon', 'src/ui', 'src/core/stub', 'src/core/types.ts'],
  'Balloon · Pattern': ['src/editors/balloon', 'src/ui', 'src/core/types.ts', 'src/core/stub'],
  Basket: ['src/editors/basket', 'src/editors/shared', 'src/core/types.ts', 'src/core/stub', 'src/stores'],
  Ring: ['src/editors/ring', 'src/editors/shared', 'src/core/types.ts', 'src/core/stub', 'src/stores'],
  Cloud: ['src/editors/cloud', 'src/core/types.ts', 'src/core/stub', 'src/stores'],
  Sun: ['src/editors/cloud', 'src/core/types.ts', 'src/core/stub', 'src/stores'],
  Figures: ['src/editors/figure', 'src/editors/shared', 'src/core/types.ts', 'src/core/stub', 'src/stores'],
  'Cable clip': ['src/editors/clip', 'src/editors/shared', 'src/core/types.ts', 'src/core/stub', 'src/stores'],
};
const WEB_FALLBACK = ['src/ui', 'src/stores', 'src/persistence', 'src/app', 'src/open', 'src/io', 'src/editors', 'src/preview', 'src/core/stub', 'src/core/real', 'src/core/types.ts'];

const load = (path) => readFileSync(path, 'utf8').split('\n');
const swiftFiles = new Map(readdirSync(swiftDir).filter((f) => f.endsWith('.swift')).map((f) => [f.replace('.swift', ''), load(join(swiftDir, f))]));

const webCache = new Map();
function webFiles(path) {
  const full = join(web, path);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [path];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return entry.name === 'demo' ? [] : webFiles(child);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [child] : [];
  });
}
const webLines = (file) => {
  if (!webCache.has(file)) webCache.set(file, load(join(web, file)));
  return webCache.get(file);
};

/** The first line with the literal, preferring a whole quoted string over a substring. */
function findIn(lines, needle) {
  const quoted = [`"${needle}"`, `'${needle}'`, `\`${needle}\``, `>${needle}<`];
  let index = lines.findIndex((line) => quoted.some((q) => line.includes(q)));
  if (index < 0) index = lines.findIndex((line) => line.includes(needle));
  return index;
}

function findSwift(part, needle) {
  const order = [...(SWIFT_BY_PART[part] ?? []), ...swiftFiles.keys()];
  for (const name of order) {
    const index = findIn(swiftFiles.get(name), needle);
    if (index >= 0) return `${name}.swift:${index + 1}`;
  }
  return null;
}

function findWeb(part, needle) {
  const order = [...(WEB_BY_PART[part] ?? []), ...WEB_FALLBACK];
  const seen = new Set();
  for (const root of order) {
    for (const file of webFiles(root)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const index = findIn(webLines(file), needle);
      if (index >= 0) return `${relative('src', file)}:${index + 1}`;
    }
  }
  return null;
}

const runs = Object.fromEntries(
  ['stub', 'real'].map((core) => {
    const path = join(results, `parity-${core}.json`);
    if (!existsSync(path)) throw new Error(`Missing ${path}: run the parity spec on the ${core} core first.`);
    return [core, JSON.parse(readFileSync(path, 'utf8'))];
  }),
);

const key = (r) => `${r.part}|${r.scene}|${r.kind}|${r.name}`;
const realByKey = new Map(runs.real.results.map((r) => [key(r), r]));
const problems = [];

const STATUS = { ok: '✅', decided: '◇', pending: '⏳', open: '❗', fail: '❌' };

const stubKeys = new Set(runs.stub.results.map(key));
const realOnly = runs.real.results.filter((r) => r.only === 'real' && !stubKeys.has(key(r)));
const rows = [...runs.stub.results, ...realOnly].map((stub) => {
  const real = realByKey.get(key(stub));
  const swift = stub.needle === null ? '–' : findSwift(stub.part, stub.needle.replaceAll('\\\\', '\\'));
  if (swift === null) problems.push(`not in the Swift source: ${stub.needle} (${stub.part} / ${stub.name})`);
  const webNeedle = stub.webNeedle ?? stub.needle;
  const webPlace = webNeedle === null ? '–' : findWeb(stub.part, webNeedle);
  const waiting = stub.status === 'pending' || realByKey.get(key(stub))?.status === 'pending';
  if (webPlace === null && !waiting) problems.push(`not in the web source: ${webNeedle} (${stub.part} / ${stub.name})`);

  const failed = [stub, real].filter((r) => r?.status === 'fail');
  const pending = stub.status === 'pending' ? stub : real?.status === 'pending' ? real : null;
  let status;
  let note = '';
  if (failed.length > 0) {
    status = STATUS.fail;
    note = `${stub.status === 'fail' ? 'stub' : ''}${stub.status === 'fail' && real?.status === 'fail' ? '+' : ''}${real?.status === 'fail' ? 'real' : ''}: ${failed[0].message ?? ''}`.slice(0, 220);
    problems.push(`fail: ${stub.part} / ${stub.scene} / ${stub.name}: ${note}`);
  } else if (!real) {
    status = STATUS.fail;
    note = 'not run on the real core';
    problems.push(`not on real: ${stub.part} / ${stub.scene} / ${stub.name}`);
  } else if (stub.open) {
    status = STATUS.open;
    note = `Open, ${stub.open.owner}: ${stub.open.note}`;
  } else if (pending) {
    status = STATUS.pending;
    note = `${pending.owner}: ${pending.message}`;
  } else if (stub.decided) {
    status = STATUS.decided;
    note = stub.decided;
  } else {
    status = STATUS.ok;
  }
  return { ...stub, swift, webPlace, statusMark: status, note };
});

const cell = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const count = (mark) => rows.filter((row) => row.statusMark === mark).length;

const lines = [];
lines.push('# Parity checklist: Mac app → web app');
lines.push('');
lines.push('Generated by `npm run e2e:parity` (`web/e2e/parity.spec.ts`, rows in `web/e2e/parity/rows.ts`, this file from `web/e2e/parity/report.mjs`). **Do not edit by hand.** Each row was checked in the running app, in Chromium through `vite`, once on the stub core and once with `VITE_CORE=real`. Swift lines and web places are looked up by a literal from the row, so they follow the code; a literal missing from the Swift source fails the run.');
lines.push('');
lines.push(`Stand: stub ${runs.stub.at}, real ${runs.real.at}.`);
lines.push('');
lines.push(`| Rows | ${STATUS.ok} identical | ${STATUS.decided} difference the plan decided | ${STATUS.pending} waits for another WP | ${STATUS.open} open gap | ${STATUS.fail} fails |`);
lines.push('| --- | --- | --- | --- | --- | --- |');
lines.push(`| ${rows.length} | ${count(STATUS.ok)} | ${count(STATUS.decided)} | ${count(STATUS.pending)} | ${count(STATUS.open)} | ${count(STATUS.fail)} |`);
lines.push('');
lines.push('What the checks can and cannot see: text, order, ranges, steps, units, help, default values, accessibility names and identifiers, JSON keys and reload behaviour are read from the DOM and localStorage. A row of kind Preview checks that the control changes what the stage draws (pixel comparison of the canvas in software WebGL), not the colors or framing themselves; those are in `Stage`-prop tests of each editor and the WP-U4 comparison with SceneKit. Numbers that come from generated meshes are checked by format; their values are the reference harness’s job. Until the K9 patterns land (#43), `VITE_CORE=real` runs patterns on the stub, so a green pattern row says nothing beyond the stub yet.');
lines.push('');
lines.push('## Decided differences');
lines.push('');
for (const text of [...new Set(rows.filter((row) => row.decided).map((row) => row.decided))]) lines.push(`- ${text}`);
lines.push('- Plan §7: text patterns and the Night Flight and Summit reliefs use the deterministic rasterizer; they are visually equivalent, not byte-identical.');
lines.push('- WP-U4 (plan §15): SceneKit’s roll bug in `frame()` for the filled neck is not ported; the web keeps y up.');
lines.push('- Accessibility: the shortcut hint on the export buttons is at opacity 0.75 (Swift 0.65) and `--ink-secondary` at 0.7, for 4.5:1 contrast.');
lines.push('');
const openRows = rows.filter((row) => row.statusMark === STATUS.open || row.statusMark === STATUS.pending);
lines.push('## Open points');
lines.push('');
if (openRows.length === 0) lines.push('None.');
const byOwner = new Map();
for (const row of openRows) {
  const owner = row.open?.owner ?? row.owner ?? (runs.real.results.find((r) => key(r) === key(row))?.owner) ?? '?';
  byOwner.set(owner, [...(byOwner.get(owner) ?? []), row]);
}
for (const [owner, group] of byOwner) {
  lines.push(`- **${owner}** (${group.length}): ${[...new Set(group.map((row) => `${row.part}: ${row.name}`))].join('; ')}.`);
}
for (const extra of [
  '**WP-U3 / WP-U9:** the store’s `error` serves export and preview alike, so a failed preview reads “… export failed”. Neither the Mac nor the stub produces such a preview failure, so no row shows it.',
  '**WP-K9:** patterns run on the stub behind `VITE_CORE=real` until #43 lands. Rerun this walk then.',
]) lines.push(`- ${extra}`);
lines.push('');

const parts = [...new Set(rows.map((row) => row.part))];
for (const part of parts) {
  lines.push(`## ${part}`);
  lines.push('');
  const inPart = rows.filter((row) => row.part === part);
  for (const scene of [...new Set(inPart.map((row) => row.scene))]) {
    lines.push(`### ${scene}`);
    lines.push('');
    lines.push('| Kind | Item | Swift | Web (`web/src/…`) | Status | Note |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const row of inPart.filter((r) => r.scene === scene)) {
      lines.push(`| ${row.kind} | ${cell(row.name)} | ${row.swift ?? '**missing**'} | ${row.webPlace ?? '–'} | ${row.statusMark} | ${cell(row.note)} |`);
    }
    lines.push('');
  }
}

writeFileSync(join(repo, 'docs', 'parity-checklist.md'), `${lines.join('\n').trimEnd()}\n`);
console.log(`rows ${rows.length}: ok ${count(STATUS.ok)}, decided ${count(STATUS.decided)}, pending ${count(STATUS.pending)}, open ${count(STATUS.open)}, fail ${count(STATUS.fail)}`);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
}
