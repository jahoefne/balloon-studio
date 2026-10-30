// Entry points of the comparison (docs/plan.md, WP-V2).
//   compareOutput(expected, actual, kind)  two byte arrays, no manifest
//   compareCase(id, tsBytes)               against the manifest and, if needed, the reference body
//   compareCaseError(id, thrown)           a case whose export has to fail
import { EQUIVALENT_CASES, type EquivalentCase } from './equivalentCases';
import { kindOfName, getCase, type ExportedCase, type ManifestEntry, type StlFacts } from './manifest';
import { loadCaseBody, loadEntryBody, sha256Hex } from './refs';
import { diffJson } from './jsonDiff';
import { identical, mismatch, needsPack, type DiffResult, type OutputKind } from './result';
import { diffStl, stlFactsProblem } from './stlDiff';
import { diffText, firstDifference } from './textDiff';
import { diffModel } from './threeMfDiff';
import { STORED_ZIP_FIELDS, diffZip, diffZipAgainst, expectedFromArchive, type ExpectedZip, type ZipDiffOptions } from './zipDiff';

/** Whether an STL may pass as `equivalent`; the name is the archive entry, null for a bare STL. */
export type EquivalentFilter = (entry: string | null) => boolean;

const entryComparer =
  (allow?: EquivalentFilter) =>
  (expected: Uint8Array, actual: Uint8Array, name: string): DiffResult =>
    compareOutput(expected, actual, kindOfName(name), allow === undefined ? {} : { allowEquivalent: () => allow(name) });

/** Compares by kind; byte-identical input is `identical` whatever the kind. */
export function compareOutput(
  expected: Uint8Array,
  actual: Uint8Array,
  kind: OutputKind,
  options: { skipEntries?: readonly string[]; allowEquivalent?: EquivalentFilter } = {},
): DiffResult {
  if (expected.length === actual.length && firstDifference(expected, actual) === expected.length) return identical();
  switch (kind) {
    case 'stl':
      return diffStl(expected, actual, options.allowEquivalent?.(null) ?? false);
    case 'zip':
    case '3mf':
      return diffZip(expected, actual, { compareEntry: entryComparer(options.allowEquivalent), ...(options.skipEntries === undefined ? {} : { skipEntries: options.skipEntries }) });
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
  /** "allowlist stale": a listed entry no longer needs its place. Never a failure. */
  warnings?: string[];
}

export interface CompareCaseOptions {
  tsMs?: number;
  /** ZIP/3MF entries not to compare, reported in the notes. */
  skipEntries?: readonly string[];
  /** Replaces `EQUIVALENT_CASES`; for tests. */
  equivalentCases?: readonly EquivalentCase[];
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

function compareExported(c: ExportedCase, tsBytes: Uint8Array, options: CompareCaseOptions, allow: EquivalentFilter): DiffResult {
  if (sha256Hex(tsBytes) === c.sha256) return identical();
  const body = loadCaseBody(c);
  if (c.kind === 'zip' || c.kind === '3mf') {
    const zipOptions: ZipDiffOptions = { compareEntry: entryComparer(allow), ...(options.skipEntries === undefined ? {} : { skipEntries: options.skipEntries }) };
    // Without the pack the Tier A entries and the hashes of all others still say a lot.
    const expected = body !== null ? expectedFromArchive(body) : expectedFromManifest(c, c.entries ?? []);
    return diffZipAgainst(expected, tsBytes, zipOptions);
  }
  if (body !== null) return compareOutput(body, tsBytes, c.kind, { allowEquivalent: allow });
  return withoutBody(c, c.kind, tsBytes) ?? needsPack(`${c.id}: the reference is only in the pack (bash mac/scripts/fetch-pack.sh)`);
}

/** Listed entries that came out `identical` or `ulp`. An entry that was skipped or could not be checked says nothing. */
function staleWarnings(listed: readonly EquivalentCase[], result: DiffResult, skipped: readonly string[]): string[] {
  const warnings: string[] = [];
  for (const { caseId, entry } of listed) {
    if (entry !== null && skipped.includes(entry)) continue;
    let status = result.status;
    if (entry !== null && result.status !== 'identical') {
      if (result.entries === undefined) continue;
      status = result.entries.find((candidate) => candidate.name === entry)?.status ?? 'identical';
    }
    if (status === 'identical' || status === 'ulp') {
      warnings.push(`allowlist stale: ${caseId}${entry === null ? '' : `/${entry}`} is ${status}, remove it from harness/equivalentCases.ts`);
    }
  }
  return warnings;
}

/** Compares the export of a grid case with its reference. */
export function compareCase(id: string, tsBytes: Uint8Array, options: CompareCaseOptions = {}): CaseResult {
  const c = getCase(id);
  const timing = { id, swiftMs: c.durationMs, ...(options.tsMs === undefined ? {} : { tsMs: options.tsMs }) };
  if (c.error !== undefined) return { ...mismatch('expected error', `Swift fails with "${c.error}", the TS export succeeded`), ...timing };
  const listed = (options.equivalentCases ?? EQUIVALENT_CASES).filter((candidate) => candidate.caseId === id);
  const result = compareExported(c, tsBytes, options, (entry) => listed.some((candidate) => candidate.entry === entry));
  const warnings = staleWarnings(listed, result, options.skipEntries ?? []);
  return { ...result, ...timing, ...(warnings.length === 0 ? {} : { warnings }) };
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
