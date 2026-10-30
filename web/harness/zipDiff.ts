// ZIP and 3MF containers: same names in the same order, same header fields, CRC equal exactly
// when the bytes are, every entry compared by its extension. The expected side is either a real
// archive or, without the pack, what the manifest knows; offsets and sizes are not compared
// directly, because a 3MF model may change length by a last digit and move what follows.
import { zipEntries, type ZipEntryInfo } from '../src/core/testing/zipReader';
import { sha256Hex } from './refs';
import { firstDifference } from './textDiff';
import { NoteList, identical, mismatch, needsPack, rollUp, type DiffResult, type EntryDiff } from './result';

/** The header fields of one entry that are not derived from its bytes or position. */
export interface EntryFields {
  madeBy: number;
  version: number;
  flags: number;
  method: number;
  time: number;
  date: number;
  extra: number;
  comment: number;
  disk: number;
  internal: number;
  external: number;
  localVersion: number;
  localFlags: number;
  localMethod: number;
  localTime: number;
  localDate: number;
  localExtra: number;
}

/** What `StoredZIP.archive` writes for every entry (core/io/storedZip.ts); compared when no archive is at hand. */
export const STORED_ZIP_FIELDS: EntryFields = {
  madeBy: 20,
  version: 20,
  flags: 0,
  method: 0,
  time: 0,
  date: 33,
  extra: 0,
  comment: 0,
  disk: 0,
  internal: 0,
  external: 0,
  localVersion: 20,
  localFlags: 0,
  localMethod: 0,
  localTime: 0,
  localDate: 33,
  localExtra: 0,
};

export interface ExpectedEntry {
  name: string;
  crc32: number;
  sha256?: string;
  fields: EntryFields;
  /** The entry's bytes, or null when they need the pack. */
  load(): Uint8Array | null;
  /** Compared when `load` returns null and the entry is not identical. */
  withoutBody?(actual: Uint8Array): DiffResult | null;
}

export interface ExpectedZip {
  entries: ExpectedEntry[];
  /** The whole archive, when it is at hand. */
  archive?: Uint8Array;
  /** The archive is known to differ (its hash did not match), so identical entries mean a bad container. */
  archiveDiffers?: boolean;
}

export type EntryComparer = (expected: Uint8Array, actual: Uint8Array, name: string) => DiffResult;

export interface ZipDiffOptions {
  compareEntry: EntryComparer;
  /** Entries left out of the comparison (raster-dependent ones in the relief and text groups). */
  skipEntries?: readonly string[];
}

function entryFields(bytes: Uint8Array, entries: readonly ZipEntryInfo[]): EntryFields[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralOffset = view.getUint32(bytes.length - 22 + 16, true);
  const fields: EntryFields[] = [];
  let at = centralOffset;
  for (const entry of entries) {
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    fields.push({
      madeBy: view.getUint16(at + 4, true),
      version: entry.version,
      flags: entry.flags,
      method: entry.method,
      time: entry.time,
      date: entry.date,
      extra,
      comment,
      disk: view.getUint16(at + 34, true),
      internal: view.getUint16(at + 36, true),
      external: view.getUint32(at + 38, true),
      localVersion: view.getUint16(entry.offset + 4, true),
      localFlags: view.getUint16(entry.offset + 6, true),
      localMethod: view.getUint16(entry.offset + 8, true),
      localTime: view.getUint16(entry.offset + 10, true),
      localDate: view.getUint16(entry.offset + 12, true),
      localExtra: view.getUint16(entry.offset + 28, true),
    });
    at += 46 + nameLength + extra + comment;
  }
  return fields;
}

/** Entries that do not follow one another without gaps, or a comment after the central directory. */
function layoutProblem(bytes: Uint8Array, entries: readonly ZipEntryInfo[], fields: readonly EntryFields[]): string | null {
  let next = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as ZipEntryInfo;
    if (entry.offset !== next) return `${entry.name} starts at ${entry.offset}, the previous entry ends at ${next}`;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    next = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + (fields[i] as EntryFields).localExtra + entry.data.length;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralOffset = view.getUint32(bytes.length - 22 + 16, true);
  return centralOffset === next ? null : `The central directory starts at ${centralOffset}, the last entry ends at ${next}`;
}

/** The expected side from a complete archive. Throws when the reference itself is not readable. */
export function expectedFromArchive(archive: Uint8Array): ExpectedZip {
  const entries = zipEntries(archive);
  const fields = entryFields(archive, entries);
  return {
    archive,
    entries: entries.map((entry, i) => ({
      name: entry.name,
      crc32: entry.crc32,
      fields: fields[i] as EntryFields,
      load: () => entry.data,
    })),
  };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && firstDifference(a, b) === a.length;
}

export function diffZipAgainst(expected: ExpectedZip, actual: Uint8Array, options: ZipDiffOptions): DiffResult {
  let actualEntries: ZipEntryInfo[];
  try {
    actualEntries = zipEntries(actual);
  } catch (error) {
    return mismatch('zip', `TS archive is not a valid stored ZIP: ${error instanceof Error ? error.message : String(error)}`);
  }
  const names = actualEntries.map((entry) => entry.name);
  const expectedNames = expected.entries.map((entry) => entry.name);
  if (names.join('\n') !== expectedNames.join('\n')) {
    const at = names.findIndex((name, i) => name !== expectedNames[i]);
    const first = at < 0 ? names.length : at;
    return mismatch('zip', `Entry names or order differ at ${first}: ${names[first] ?? '(none)'} vs ${expectedNames[first] ?? '(none)'} (${names.length} entries, reference has ${expectedNames.length})`);
  }

  const container = new NoteList();
  const actualFields = entryFields(actual, actualEntries);
  const problem = layoutProblem(actual, actualEntries, actualFields);
  if (problem !== null) container.add(problem);
  const results: EntryDiff[] = [];
  const skipped = new Set(options.skipEntries ?? []);
  let skippedCount = 0;
  actualEntries.forEach((entry, i) => {
    const reference = expected.entries[i] as ExpectedEntry;
    const fields = actualFields[i] as EntryFields;
    for (const key of Object.keys(fields) as (keyof EntryFields)[]) {
      if (fields[key] !== reference.fields[key]) container.add(`${entry.name}: ${key} ${fields[key]} vs ${reference.fields[key]}`);
    }
    if (skipped.has(entry.name)) {
      skippedCount++;
      return;
    }
    const sameCrc = entry.crc32 === reference.crc32;
    if (reference.sha256 !== undefined && sha256Hex(entry.data) === reference.sha256) {
      if (!sameCrc) container.add(`${entry.name}: CRC differs although the bytes are identical`);
      results.push({ ...identical(), name: entry.name });
      return;
    }
    const body = reference.load();
    if (body === null) {
      const early = reference.withoutBody?.(entry.data) ?? null;
      const result = early ?? needsPack(`${entry.name} differs from the reference, which is only in the pack`);
      results.push({ ...result, name: entry.name });
      return;
    }
    if (sameCrc !== bytesEqual(body, entry.data)) {
      container.add(`${entry.name}: CRC ${sameCrc ? 'equal' : 'different'} although the bytes are ${sameCrc ? 'different' : 'equal'}`);
    }
    results.push({ ...options.compareEntry(body, entry.data, entry.name), name: entry.name });
  });

  const allIdentical = results.every((result) => result.status === 'identical');
  if (container.notes.length === 0 && allIdentical && skippedCount === 0) {
    const differs = expected.archive !== undefined ? !bytesEqual(expected.archive, actual) : (expected.archiveDiffers ?? false);
    if (differs) container.add('Every entry is identical, but the archive bytes differ (end record or central directory)');
  }
  const own = container.notes.length > 0 ? mismatch('zip', ...container.all()) : identical();
  const rolled = rollUp(results, own);
  if (skippedCount > 0) rolled.notes.push(`${skippedCount} raster-dependent entries not compared: ${[...skipped].join(', ')}`);
  return rolled;
}

export function diffZip(expected: Uint8Array, actual: Uint8Array, options: ZipDiffOptions): DiffResult {
  return diffZipAgainst(expectedFromArchive(expected), actual, options);
}
