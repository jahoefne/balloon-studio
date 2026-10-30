// `npm run census` (docs/plan.md WP-V3): counts the assertions of each Swift test file and of the TS tests it was
// ported to, and fails when a TS count falls below the Swift count minus the allowlist.
//
// Swift counts `require(` and `check(`, TS counts `check(` and `expect(`, comments and string contents ignored,
// definitions excluded. A count is a floor, not a proof: one TS `check` may join two Swift `require`s and a TS table may
// add assertions Swift does not have. `npm run census -- --messages` lists the Swift messages that no mapped TS source
// spells out, which is the sharper question; it reports and never fails.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const swiftDirectory = fileURLToPath(new URL('../../mac/Tests/', import.meta.url));

/** Part of a TS file: from the first line containing `from` (or the top) up to the first line containing `to` (or the end). */
interface Section {
  file: string;
  from?: string;
  to?: string;
}
type Source = string | Section;

interface Row {
  swift: string;
  ts: readonly Source[];
  /** The work package that still has to port this file. Its assertions count as allowlisted until the TS file exists. */
  pending?: string;
}

const BASKET = 'tests/basket.test.ts';
const FEATURES = 'tests/support/lampFeatures.ts';
const PATTERNS = 'tests/patterns.test.ts';

/** Swift test file → TS sources. A TS file that serves several Swift files is cut at stable anchors. */
const TABLE: readonly Row[] = [
  { swift: 'BasketHoleTests.swift', ts: [{ file: BASKET, from: '/** BasketHoleTests.swift', to: '/** GeometryTests.swift' }] },
  { swift: 'CableClampTests.swift', ts: ['tests/cableClamp.test.ts', { file: FEATURES, from: 'export const checkCableClamp' }] },
  { swift: 'CableClipTests.swift', ts: ['tests/cableClip.test.ts'] },
  {
    swift: 'CableOutletTests.swift',
    ts: ['tests/cableOutlet.test.ts', 'tests/cableOutletChained.test.ts', { file: FEATURES, from: 'export const checkCableOutlet', to: 'export const checkCableClamp' }],
  },
  { swift: 'CloudShapeTests.swift', ts: ['tests/cloudShape.test.ts'] },
  { swift: 'CloudTests.swift', ts: ['tests/cloud.test.ts', { file: FEATURES, to: 'export const checkCableOutlet' }] },
  { swift: 'FigureTests.swift', ts: ['tests/figures.test.ts'] },
  {
    swift: 'GeometryTests.swift',
    ts: ['tests/balloon.test.ts', 'tests/ring.test.ts', 'src/core/testing/stl.ts', { file: BASKET, from: '/** GeometryTests.swift', to: '/** WickerTests.swift' }],
  },
  { swift: 'LampSettingsTests.swift', ts: ['tests/lampSettings.test.ts'] },
  { swift: 'LampSurfaceTests.swift', ts: ['tests/lampSurface.test.ts'] },
  { swift: 'NailInsertTests.swift', ts: ['tests/nailInsert.test.ts'] },
  {
    swift: 'NightFlightTests.swift',
    ts: ['tests/nightFlightArtwork.test.ts', { file: PATTERNS, from: '// NightFlightTests.validateFlightSTL', to: "describe('decoding as JSONDecoder does'" }],
  },
  { swift: 'PatternTests.swift', ts: ['tests/textMask.test.ts', { file: PATTERNS, to: '// NightFlightTests.validateFlightSTL' }] },
  { swift: 'STLImportTests.swift', ts: ['tests/stlImport.test.ts'] },
  { swift: 'SummitCableCarTests.swift', ts: ['tests/summitCableCarArtwork.test.ts'], pending: 'WP-R5' },
  { swift: 'SunTests.swift', ts: ['tests/sun.test.ts'] },
  { swift: 'WickerTests.swift', ts: ['src/core/testing/basket.ts', { file: BASKET, from: '/** WickerTests.swift', to: "describe('BasketParameters'" }] },
];

interface Allowed {
  swift: string;
  /** Inclusive, 1-based. mac/Tests is frozen, so line numbers stay right. */
  lines: readonly [number, number];
  /** The text the first line has to contain, so a moved line fails loudly. */
  anchor: string;
  reason: string;
}

/**
 * Swift lines that have no TS counterpart. Lines without an assertion subtract nothing; they are here so that the list
 * of what was left out is complete (plan §8, and item 5 of WP-V3: nothing writes to .build/test-output).
 */
const ALLOWLIST: readonly Allowed[] = [
  { swift: 'CloudTests.swift', lines: [94, 98], anchor: 'UserDefaults', reason: 'UserDefaults persistence: the web keeps settings in localStorage (plan §5), tested in src/persistence and src/stores.' },
  { swift: 'PatternTests.swift', lines: [16, 16], anchor: 'setbuf', reason: 'setbuf: unbuffered stdout for the Swift runner.' },
  { swift: 'PatternTests.swift', lines: [17, 17], anchor: 'pattern-tests', reason: 'Creates .build/pattern-tests for the 3MFs of verify-3mf.py (WP-R7 export-pattern-tests.ts).' },
  { swift: 'PatternTests.swift', lines: [41, 41], anchor: 'threeMF', reason: 'Writes the 3MF: the harness compares it against the Swift reference (tests/patterns.reference.test.ts).' },
  { swift: 'NightFlightTests.swift', lines: [71, 72], anchor: 'threeMF', reason: 'Writes 3MF and STL: the harness compares the relief cases (tests/patterns.reference.test.ts).' },
  { swift: 'CloudTests.swift', lines: [45, 50], anchor: 'test-output', reason: 'Writes the kit: the harness compares it (tests/lamp.reference.test.ts).' },
  { swift: 'CloudShapeTests.swift', lines: [66, 69], anchor: 'test-output', reason: 'Writes the kit: the harness compares the shapes (tests/lamp.reference.test.ts).' },
  { swift: 'SunTests.swift', lines: [162, 165], anchor: 'test-output', reason: 'Writes the kit: the harness compares it (tests/lamp.reference.test.ts).' },
  { swift: 'LampSurfaceTests.swift', lines: [64, 66], anchor: 'test-output', reason: 'Writes the kit: the harness compares the sculpted kits (tests/lamp.reference.test.ts).' },
  { swift: 'NailInsertTests.swift', lines: [119, 122], anchor: 'test-output', reason: 'Writes the kit for verify-cloud-blender.py: the harness compares the nailInsert kits.' },
  { swift: 'CableOutletTests.swift', lines: [102, 105], anchor: 'test-output', reason: 'Writes the kit: the harness compares chained outlets (tests/lamp.reference.test.ts).' },
  { swift: 'CableOutletTests.swift', lines: [470, 472], anchor: 'test-output', reason: 'Writes the kit: the harness compares the outlet kits (tests/lamp.reference.test.ts).' },
  { swift: 'CableClampTests.swift', lines: [290, 297], anchor: 'verify-cloud-blender', reason: 'Writes kit and seated parts for the Blender verifier: not run from the tests (plan §10).' },
  { swift: 'CableClipTests.swift', lines: [11, 12], anchor: 'test-output', reason: 'Clears .build/test-output/cable-clip.' },
  { swift: 'CableClipTests.swift', lines: [185, 189], anchor: 'cable-clip', reason: 'Writes clip and seated parts for the Blender verifier: the harness compares the clip (tests/cableClip.reference.test.ts).' },
  { swift: 'FigureTests.swift', lines: [7, 7], anchor: 'test-output', reason: 'Creates .build/test-output/figures.' },
  { swift: 'FigureTests.swift', lines: [77, 77], anchor: 'test-output', reason: 'Writes the set ZIP: the harness compares it (tests/figures.reference.test.ts).' },
  { swift: 'FigureTests.swift', lines: [124, 124], anchor: 'test-output', reason: 'Writes the figure: the harness compares it (tests/figures.reference.test.ts).' },
  { swift: 'GeometryTests.swift', lines: [41, 41], anchor: 'test-output', reason: 'Creates .build/test-output.' },
  { swift: 'GeometryTests.swift', lines: [76, 76], anchor: 'test-output', reason: 'Writes the basket: the harness compares it (tests/basket.reference.test.ts).' },
  { swift: 'GeometryTests.swift', lines: [200, 205], anchor: 'test-output', reason: 'Writes the balloon: the harness compares it (tests/balloon.reference.test.ts).' },
  { swift: 'GeometryTests.swift', lines: [333, 333], anchor: 'test-output', reason: 'Writes the ring: the harness compares it (tests/ring.reference.test.ts).' },
  { swift: 'GeometryTests.swift', lines: [444, 446], anchor: 'test-output', reason: 'Writes the ring kit: the harness compares it (tests/ring.reference.test.ts).' },
  { swift: 'GeometryTests.swift', lines: [591, 591], anchor: 'test-output', reason: 'Writes the uplight ring: the harness compares it (tests/ring.reference.test.ts).' },
  { swift: 'WickerTests.swift', lines: [83, 83], anchor: 'test-output', reason: 'Writes the wicker detail: the harness compares baskets (tests/basket.reference.test.ts).' },
];

/**
 * Blanks comments and the contents of strings, keeping every offset. It is a line-oriented scan, good enough for these
 * sources: `'` and `"` end at the end of a line at the latest, so a quote in a regular expression cannot run away.
 */
function codeOnly(source: string): string {
  const out = source.split('');
  const blank = (at: number): void => {
    if (out[at] !== '\n') out[at] = ' ';
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') blank(i++);
    } else if (c === '/' && next === '*') {
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) blank(i++);
      blank(i++);
      blank(i++);
    } else if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < source.length && source[i] !== c && (c === '`' || source[i] !== '\n')) {
        if (source[i] === '\\') blank(i++);
        blank(i++);
      }
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

const SWIFT_ASSERTION = /(?<!func )\b(?:require|check)\(/g;
const TS_ASSERTION = /(?<!function )\b(?:check|expect)\(/g;

const count = (code: string, pattern: RegExp): number => (code.match(pattern) ?? []).length;

const sectionText = (source: Source): { label: string; text: string; missing: boolean } => {
  const file = typeof source === 'string' ? source : source.file;
  const label = typeof source === 'string' ? source : `${source.file}[${source.from ?? 'top'} … ${source.to ?? 'end'}]`;
  const path = `${web}${file}`;
  if (!existsSync(path)) return { label, text: '', missing: true };
  let lines = readFileSync(path, 'utf8').split('\n');
  if (typeof source !== 'string') {
    const anchored = (anchor: string): number => {
      const at = lines.findIndex((line) => line.includes(anchor));
      if (at < 0) throw new Error(`${file}: anchor not found: ${anchor}. Update the table in scripts/assertion-census.ts.`);
      return at;
    };
    if (source.to !== undefined) lines = lines.slice(0, anchored(source.to));
    if (source.from !== undefined) lines = lines.slice(anchored(source.from));
  }
  return { label, text: lines.join('\n'), missing: false };
};

/** Literal pieces of the last string among the arguments of each Swift assertion call. */
function swiftMessages(source: string): { line: number; pieces: string[] }[] {
  const code = codeOnly(source);
  const messages: { line: number; pieces: string[] }[] = [];
  for (const match of code.matchAll(SWIFT_ASSERTION)) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < code.length; end++) {
      const c = code[end];
      if (c === '(') depth++;
      if (c === ')' && --depth === 0) break;
    }
    const literal = [...source.slice(match.index, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)].at(-1)?.[1];
    if (literal === undefined) continue;
    const pieces = literal.split(/\\\((?:[^()]|\([^()]*\))*\)/).map((piece) => piece.trim()).filter((piece) => piece.length >= 6);
    if (pieces.length > 0) messages.push({ line: code.slice(0, match.index).split('\n').length, pieces });
  }
  return messages;
}

interface Result {
  swift: string;
  swiftCount: number;
  allowed: number;
  ts: number;
  pending?: string;
  ok: boolean;
  note: string;
}

function censusRow(row: Row): Result {
  const swiftSource = readFileSync(`${swiftDirectory}${row.swift}`, 'utf8');
  const code = codeOnly(swiftSource).split('\n');
  const raw = swiftSource.split('\n');
  const swiftCount = count(code.join('\n'), SWIFT_ASSERTION);
  let allowed = 0;
  for (const entry of ALLOWLIST.filter((a) => a.swift === row.swift)) {
    const [first, last] = entry.lines;
    if (!raw[first - 1]!.includes(entry.anchor)) throw new Error(`${row.swift}:${first} does not contain "${entry.anchor}": the allowlist is out of date.`);
    allowed += count(code.slice(first - 1, last).join('\n'), SWIFT_ASSERTION);
  }
  const sources = row.ts.map(sectionText);
  const missing = sources.filter((source) => source.missing).map((source) => source.label);
  const ts = sources.reduce((sum, source) => sum + count(codeOnly(source.text), TS_ASSERTION), 0);
  const waiting = row.pending !== undefined && missing.length > 0;
  const required = swiftCount - allowed;
  const ok = waiting || (missing.length === 0 && ts >= required);
  const note = waiting
    ? `waits for ${row.pending}`
    : missing.length > 0
      ? `missing: ${missing.join(', ')}`
      : ts < required
        ? `${required - ts} short`
        : '';
  return { swift: row.swift, swiftCount, allowed: waiting ? swiftCount : allowed, ts, ...(row.pending === undefined ? {} : { pending: row.pending }), ok, note };
}

function unmatchedMessages(row: Row): string[] {
  const source = readFileSync(`${swiftDirectory}${row.swift}`, 'utf8');
  const ts = row.ts.map(sectionText).map((section) => section.text).join('\n');
  return swiftMessages(source)
    .filter(({ pieces }) => !pieces.some((piece) => ts.includes(piece)))
    .map(({ line, pieces }) => `${row.swift}:${line}  ${pieces.join(' … ')}`);
}

const pad = (value: string | number, width: number): string => String(value).padStart(width);

export function run(): number {
  const results = TABLE.map(censusRow);
  console.log(`${'Swift file'.padEnd(28)} ${pad('Swift', 6)} ${pad('allow', 6)} ${pad('needed', 6)} ${pad('TS', 6)}  note`);
  for (const r of results) {
    console.log(`${r.swift.padEnd(28)} ${pad(r.swiftCount, 6)} ${pad(r.allowed, 6)} ${pad(r.swiftCount - r.allowed, 6)} ${pad(r.ts, 6)}  ${r.ok ? r.note || 'ok' : `FAIL ${r.note}`}`);
  }
  const sum = (pick: (r: Result) => number): number => results.reduce((total, r) => total + pick(r), 0);
  console.log(`${'total'.padEnd(28)} ${pad(sum((r) => r.swiftCount), 6)} ${pad(sum((r) => r.allowed), 6)} ${pad(sum((r) => r.swiftCount - r.allowed), 6)} ${pad(sum((r) => r.ts), 6)}`);
  if (process.argv.includes('--messages')) {
    const unmatched = TABLE.flatMap(unmatchedMessages);
    console.log(`\nSwift messages no mapped TS source spells out (${unmatched.length}; report only):`);
    for (const line of unmatched) console.log(`  ${line}`);
  }
  const unlisted = ALLOWLIST.filter((entry) => !TABLE.some((row) => row.swift === entry.swift));
  if (unlisted.length > 0) throw new Error(`Allowlist names files outside the table: ${unlisted.map((entry) => entry.swift).join(', ')}`);
  return results.every((r) => r.ok) ? 0 : 1;
}

process.exitCode = run();
