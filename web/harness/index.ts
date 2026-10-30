// Public API of the harness for the core work packages; see harness/README.md.
import { compareCase, compareCaseError, type CaseResult, type CompareCaseOptions } from './compare';
import { getCase, isExported } from './manifest';
import { formatTable, toRow } from './report';
import { statusLabel } from './result';
import { diffJson } from './jsonDiff';

export { compareCase, compareCaseError, compareOutput, type CaseResult, type CompareCaseOptions } from './compare';
export { BOUNDED_CASES, EQUIVALENT_CASES, type BoundedCase, type EquivalentCase } from './equivalentCases';
export { allCases, getCase, isExported, isStrictKind, kindOfName, loadManifest } from './manifest';
export type { ExportedCase, FailingCase, ManifestEntry, ReferenceCase } from './manifest';
export { hasPack, loadCaseBody, loadEntryBody, packDir, referenceAvailable } from './refs';
export { formatTable, summarize, toRow, writeReport, type ReportRow } from './report';
export { statusLabel, type DiffResult, type OutputKind, type Status } from './result';

export interface ExpectReferenceOptions extends CompareCaseOptions {
  /** Require byte identity: `ulp`, `equivalent` and `equivalent-bounded` fail as well. */
  strict?: boolean;
  /**
   * A PR run without the pack: whatever Tier A and the manifest can check is still checked and
   * a mismatch still fails, but what only the pack could settle passes with a warning.
   * Without this option `unverified` fails on CI and warns locally.
   */
  allowUnverified?: boolean;
}

/** Thrown by `expectReference` and friends; `result` has the structured details. */
export class ReferenceMismatchError extends Error {
  readonly result: CaseResult;
  constructor(result: CaseResult) {
    super(describeResult(result));
    this.name = 'ReferenceMismatchError';
    this.result = result;
  }
}

/** The table row, then every note. */
export function describeResult(result: CaseResult): string {
  return [`${result.id}: ${statusLabel(result)}`, formatTable([toRow(result)]), ...(result.warnings ?? []), ...result.notes].join('\n');
}

function enforce(result: CaseResult, options: ExpectReferenceOptions): CaseResult {
  if (result.status === 'mismatch') throw new ReferenceMismatchError(result);
  if (result.status !== 'identical' && result.status !== 'unverified' && options.strict === true) throw new ReferenceMismatchError(result);
  for (const warning of result.warnings ?? []) console.warn(warning);
  if (result.status === 'unverified') {
    const fatal = options.allowUnverified !== true && process.env['CI'] !== undefined && process.env['CI'] !== '';
    if (fatal) throw new ReferenceMismatchError(result);
    console.warn(describeResult(result));
  }
  return result;
}

/**
 * For vitest: throws unless the TS export of grid case `caseId` passes against its Swift
 * reference. Returns the result, so a test can assert more (`ulpCount`, …).
 */
export function expectReference(caseId: string, bytes: Uint8Array, options: ExpectReferenceOptions = {}): CaseResult {
  return enforce(compareCase(caseId, bytes, options), options);
}

/** For vitest: `thrown` is what the TS export threw for a case whose Swift export fails. */
export function expectReferenceError(caseId: string, thrown: unknown, options: Pick<ExpectReferenceOptions, 'tsMs'> = {}): CaseResult {
  return enforce(compareCaseError(caseId, thrown, options), {});
}

const NORMALIZED_FIELD = { parameters: 'normalized', pattern: 'normalizedPattern', purge: 'normalizedPurge' } as const;

/**
 * For vitest, step 1 of a core work package: `json` is the sorted `JSONEncoder` text of the
 * normalized settings and has to equal the manifest's string byte for byte.
 */
export function expectNormalized(caseId: string, json: string, which: keyof typeof NORMALIZED_FIELD = 'parameters'): void {
  const c = getCase(caseId);
  if (!isExported(c)) throw new Error(`Case ${caseId} has no normalized settings: its export fails with "${c.error}"`);
  const expected = c[NORMALIZED_FIELD[which]];
  if (expected === undefined) throw new Error(`Case ${caseId} has no normalized ${which} settings`);
  if (expected === json) return;
  const encoder = new TextEncoder();
  const diff = diffJson(encoder.encode(expected), encoder.encode(json));
  throw new Error(`${caseId}: normalized ${which} differ\n${diff.notes.join('\n')}`);
}
