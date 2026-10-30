// Entry points of the comparison (docs/plan.md, WP-V2).
//   compareOutput(expected, actual, kind)  two byte arrays, no manifest
//   compareCase(id, tsBytes)               against the manifest and, if needed, the reference body
//   compareCaseError(id, thrown)           a case whose export has to fail
import { kindOfName, getCase, type ExportedCase, type ManifestEntry, type StlFacts } from './manifest';
import { loadCaseBody, loadEntryBody, sha256Hex } from './refs';
import { diffJson } from './jsonDiff';
import { identical, mismatch, needsPack, type DiffResult, type OutputKind } from './result';
import { diffStl, stlFactsProblem } from './stlDiff';
import { diffText, firstDifference } from './textDiff';
import { diffModel } from './threeMfDiff';
import { STORED_ZIP_FIELDS, diffZip, diffZipAgainst, expectedFromArchive, type ExpectedZip, type ZipDiffOptions } from './zipDiff';

const compareEntry = (expected: Uint8Array, actual: Uint8Array, name: string): DiffResult => compareOutput(expected, actual, kindOfName(name));

/** Compares by kind; byte-identical input is `identical` whatever the kind. */
export function compareOutput(expected: Uint8Array, actual: Uint8Array, kind: OutputKind, options: { skipEntries?: readonly string[] } = {}): DiffResult {
  if (expected.length === actual.length && firstDifference(expected, actual) === expected.length) return identical();
  switch (kind) {
    case 'stl':
      return diffStl(expected, actual);
    case 'zip':
    case '3mf':
      return diffZip(expected, actual, { compareEntry, ...options });
    case 'json':
      return diffJson(expected, actual);
    case 'model':
      return diffModel(expected, actual);
    case 'text':
    case 'svg':
      return diffText(expected, actual);
  }
}

export interface CaseResult extends DiffResult {
  id: string;
  /** Duration of the Swift export, from the manifest. */
  swiftMs: number;
  /** Duration of the TS export, when the caller measured it. */
  tsMs?: number;
}

export interface CompareCaseOptions {
  tsMs?: number;
  /** ZIP/3MF entries not to compare, reported in the notes. */
  skipEntries?: readonly string[];
}

function withoutBody(facts: StlFacts, kind: OutputKind, actual: Uint8Array): DiffResult | null {
  return kind === 'stl' ? stlFactsProblem(facts, actual) : null;
}

function expectedFromManifest(c: ExportedCase, entries: readonly ManifestEntry[]): ExpectedZip {
  return {
    archiveDiffers: true,
    entries: entries.map((entry) => ({
      name: entry.name,
      crc32: entry.crc32,
      sha256: entry.sha256,
      fields: STORED_ZIP_FIELDS,
      load: () => loadEntryBody(c, entry),
      withoutBody: (actual) => withoutBody(entry, entry.kind, actual),
    })),
  };
}

function compareExported(c: ExportedCase, tsBytes: Uint8Array, options: CompareCaseOptions): DiffResult {
  if (sha256Hex(tsBytes) === c.sha256) return identical();
  const body = loadCaseBody(c);
  if (c.kind === 'zip' || c.kind === '3mf') {
    const zipOptions: ZipDiffOptions = { compareEntry, ...(options.skipEntries === undefined ? {} : { skipEntries: options.skipEntries }) };
    // Without the pack the Tier A entries and the hashes of all others still say a lot.
    const expected = body !== null ? expectedFromArchive(body) : expectedFromManifest(c, c.entries ?? []);
    return diffZipAgainst(expected, tsBytes, zipOptions);
  }
  if (body !== null) return compareOutput(body, tsBytes, c.kind);
  return withoutBody(c, c.kind, tsBytes) ?? needsPack(`${c.id}: the reference is only in the pack (bash mac/scripts/fetch-pack.sh)`);
}

/** Compares the export of a grid case with its reference. */
export function compareCase(id: string, tsBytes: Uint8Array, options: CompareCaseOptions = {}): CaseResult {
  const c = getCase(id);
  const timing = { id, swiftMs: c.durationMs, ...(options.tsMs === undefined ? {} : { tsMs: options.tsMs }) };
  if (c.error !== undefined) return { ...mismatch('expected error', `Swift fails with "${c.error}", the TS export succeeded`), ...timing };
  return { ...compareExported(c, tsBytes, options), ...timing };
}

function errorMessage(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.message;
  if (typeof thrown === 'object' && thrown !== null && 'message' in thrown) return String(thrown.message);
  return String(thrown);
}

/** The TS export threw `thrown`: right for a case the manifest records an error for, with the same text. */
export function compareCaseError(id: string, thrown: unknown, options: Pick<CompareCaseOptions, 'tsMs'> = {}): CaseResult {
  const c = getCase(id);
  const timing = { id, swiftMs: c.durationMs, ...(options.tsMs === undefined ? {} : { tsMs: options.tsMs }) };
  const message = errorMessage(thrown);
  if (c.error === undefined) return { ...mismatch('unexpected error', `The TS export threw "${message}", Swift exports ${c.filename}`), ...timing };
  const wanted = c.expectError ?? c.error;
  if (!message.includes(wanted)) return { ...mismatch('error text', `The TS export threw "${message}", Swift's error is "${c.error}"`), ...timing };
  return { ...identical(), ...timing };
}
