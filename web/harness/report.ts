// Console table and references/report.json (a local or CI artifact, committed once per pack
// version by WP-V4).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BoundedMeasures } from './boundedDiff';
import type { CaseResult } from './compare';
import { REFERENCES_DIR, loadManifest } from './manifest';
import { statusLabel, type Status } from './result';

export const DEFAULT_REPORT_PATH = `${REFERENCES_DIR}report.json`;

/** `skipped`: the core does not implement the case's part yet (skipList.ts). */
export type RowStatus = Status | 'skipped';

export interface ReportRow {
  id: string;
  status: RowStatus;
  label: string;
  maxUlp: number;
  ulpCount: number;
  normalDiffs: number;
  nearZeroCorners: number;
  differingTriangles: number;
  /** `equivalent-bounded` only: what was measured against the entry's limits. */
  bounded: BoundedMeasures | null;
  warnings: string[];
  tsMs: number | null;
  swiftMs: number;
  note: string;
}

export function toRow(result: CaseResult): ReportRow {
  return {
    id: result.id,
    status: result.status,
    label: statusLabel(result),
    maxUlp: result.maxUlp,
    ulpCount: result.ulpCount,
    normalDiffs: result.normalDiffs,
    nearZeroCorners: result.nearZeroCorners,
    differingTriangles: result.differingTriangles,
    bounded: result.bounded ?? null,
    warnings: result.warnings ?? [],
    tsMs: result.tsMs ?? null,
    swiftMs: result.swiftMs,
    note: (result.warnings?.[0] ?? result.notes[0] ?? '').split('\n')[0] as string,
  };
}

/** A case left out by the skip list; `by` is the work package it waits for. */
export function skippedRow(id: string, by: string, swiftMs: number): ReportRow {
  return {
    id,
    status: 'skipped',
    label: `skipped (${by})`,
    maxUlp: 0,
    ulpCount: 0,
    normalDiffs: 0,
    nearZeroCorners: 0,
    differingTriangles: 0,
    bounded: null,
    warnings: [],
    tsMs: null,
    swiftMs,
    note: '',
  };
}

const COLUMNS = ['id', 'status', 'maxUlp', 'ulpCount', 'tsMs', 'swiftMs', 'note'] as const;

/** `id | status | maxUlp | ulpCount | tsMs | swiftMs | note`, one line per row. */
export function formatTable(rows: readonly ReportRow[]): string {
  const cells = rows.map((row) => [
    row.id,
    row.label,
    String(row.maxUlp),
    String(row.ulpCount),
    row.tsMs === null ? '-' : String(Math.round(row.tsMs)),
    String(row.swiftMs),
    row.note.length > 100 ? `${row.note.slice(0, 100)}…` : row.note,
  ]);
  const widths = COLUMNS.map((title, i) => Math.max(title.length, ...cells.map((cell) => (cell[i] as string).length)));
  const line = (values: readonly string[]): string =>
    values
      .map((value, i) => (i === values.length - 1 ? value : value.padEnd(widths[i] as number)))
      .join(' | ')
      .trimEnd();
  return [line(COLUMNS), line(widths.map((width) => '-'.repeat(width))), ...cells.map(line)].join('\n');
}

export function summarize(rows: readonly ReportRow[]): Record<RowStatus, number> {
  const counts: Record<RowStatus, number> = { identical: 0, ulp: 0, equivalent: 0, 'equivalent-bounded': 0, mismatch: 0, unverified: 0, skipped: 0 };
  for (const row of rows) counts[row.status]++;
  return counts;
}

/** Writes the report; `implementation` is the `CoreApi.implementation` that produced the rows. */
export function writeReport(rows: readonly ReportRow[], implementation: string, path: string = DEFAULT_REPORT_PATH): void {
  const manifest = loadManifest();
  const report = {
    implementation,
    release: manifest.pack.release,
    manifestGeneratedAt: manifest.generatedAt,
    sourcesSha256: manifest.sourcesSha256,
    summary: summarize(rows),
    warnings: rows.flatMap((row) => row.warnings),
    rows,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
