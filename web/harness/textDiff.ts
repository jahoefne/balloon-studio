// Exact text comparison (.md, .txt, .svg, .xml, .rels) with a unified diff of the difference.
import { identical, mismatch, type DiffResult } from './result';

const DIFF_LINE_LIMIT = 60;
const LCS_CELL_LIMIT = 4_000_000;
const CONTEXT = 3;

type Op = { kind: ' ' | '-' | '+'; text: string };

/** Edit script of the changed middle: LCS while that is affordable, else one block replacing the other. */
function editScript(oldLines: string[], newLines: string[], oldStart: number, oldEnd: number, newStart: number, newEnd: number): Op[] {
  const ops: Op[] = [];
  const rows = oldEnd - oldStart;
  const columns = newEnd - newStart;
  if (rows * columns > LCS_CELL_LIMIT) {
    for (let i = oldStart; i < oldEnd; i++) ops.push({ kind: '-', text: oldLines[i] as string });
    for (let j = newStart; j < newEnd; j++) ops.push({ kind: '+', text: newLines[j] as string });
    return ops;
  }
  const width = columns + 1;
  const table = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      table[i * width + j] =
        oldLines[oldStart + i] === newLines[newStart + j]
          ? (table[(i + 1) * width + j + 1] as number) + 1
          : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number);
    }
  }
  let i = 0;
  let j = 0;
  while (i < rows || j < columns) {
    if (i < rows && j < columns && oldLines[oldStart + i] === newLines[newStart + j]) {
      ops.push({ kind: ' ', text: oldLines[oldStart + i] as string });
      i++;
      j++;
    } else if (i < rows && (j === columns || (table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number))) {
      ops.push({ kind: '-', text: oldLines[oldStart + i] as string });
      i++;
    } else {
      ops.push({ kind: '+', text: newLines[newStart + j] as string });
      j++;
    }
  }
  return ops;
}

/** `--- swift`, `+++ ts`, one hunk from the first to the last differing line. Empty for equal texts. */
export function unifiedDiff(expected: string, actual: string): string {
  if (expected === actual) return '';
  const oldLines = expected.split('\n');
  const newLines = actual.split('\n');
  let head = 0;
  while (head < oldLines.length && head < newLines.length && oldLines[head] === newLines[head]) head++;
  let tail = 0;
  while (tail < oldLines.length - head && tail < newLines.length - head && oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]) tail++;
  const ops = editScript(oldLines, newLines, head, oldLines.length - tail, head, newLines.length - tail);
  const before = Math.min(CONTEXT, head);
  const after = Math.min(CONTEXT, tail);
  const body: string[] = [];
  for (let i = head - before; i < head; i++) body.push(` ${oldLines[i]}`);
  for (const op of ops) body.push(`${op.kind}${op.text}`);
  for (let i = oldLines.length - tail; i < oldLines.length - tail + after; i++) body.push(` ${oldLines[i]}`);
  const oldCount = oldLines.length - tail - head + before + after;
  const newCount = newLines.length - tail - head + before + after;
  const lines = [`--- swift`, `+++ ts`, `@@ -${head - before + 1},${oldCount} +${head - before + 1},${newCount} @@`, ...body];
  return lines.length <= DIFF_LINE_LIMIT ? lines.join('\n') : `${lines.slice(0, DIFF_LINE_LIMIT).join('\n')}\n… ${lines.length - DIFF_LINE_LIMIT} more lines`;
}

/** Byte offset of the first difference, or the shorter length. */
export function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const length = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return i;
  return length;
}

const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

export function diffText(expected: Uint8Array, actual: Uint8Array): DiffResult {
  const offset = firstDifference(expected, actual);
  if (offset === expected.length && expected.length === actual.length) return identical();
  const diff = unifiedDiff(decoder.decode(expected), decoder.decode(actual));
  return mismatch('text', `First difference at byte ${offset} (${actual.length} bytes, reference ${expected.length})`, ...(diff === '' ? [] : [diff]));
}
