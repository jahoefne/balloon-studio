// Reader for the archives written by core/io/storedZip.ts (port of mac/Sources/BalloonStudio/
// ThreeMF.swift @ cbda68d, StoredZIP). Independent of the writer: walks the central directory
// from the end-of-central-directory record, checks every local header against it and verifies
// the CRC-32. Stored (method 0) entries only, as Balloon Studio writes no other kind.
import { crc32 } from '../io/crc32';
import { utf8Decode } from '../swift/text';
import { check } from './check';

export interface ZipEntryInfo {
  name: string;
  data: Uint8Array;
  crc32: number;
  /** Byte offset of the local header. */
  offset: number;
  version: number;
  flags: number;
  method: number;
  time: number;
  date: number;
}

/** Entries of a stored ZIP archive, in central-directory order. Throws on any inconsistency. */
export function zipEntries(bytes: Uint8Array): ZipEntryInfo[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  check(bytes.length >= 22, 'ZIP too short for an end-of-central-directory record');
  const end = bytes.length - 22;
  check(view.getUint32(end, true) === 0x06054b50, 'Missing end-of-central-directory record (archive comments are not supported)');
  const count = view.getUint16(end + 10, true);
  check(view.getUint16(end + 8, true) === count, 'Multi-disk ZIP archives are not supported');
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  check(centralOffset + centralSize === end, 'Central directory does not end at the end record');
  const entries: ZipEntryInfo[] = [];
  let at = centralOffset;
  for (let i = 0; i < count; i++) {
    check(view.getUint32(at, true) === 0x02014b50, `Bad central directory header ${i}`);
    const version = view.getUint16(at + 6, true);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const time = view.getUint16(at + 12, true);
    const date = view.getUint16(at + 14, true);
    const crc = view.getUint32(at + 16, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = utf8Decode(bytes.subarray(at + 46, at + 46 + nameLength));
    check(method === 0 && compressed === size, `Entry ${name} is not stored`);
    check(view.getUint32(offset, true) === 0x04034b50, `Bad local header for ${name}`);
    check(view.getUint32(offset + 14, true) === crc && view.getUint32(offset + 22, true) === size, `Local header of ${name} disagrees with the central directory`);
    const localNameLength = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    check(utf8Decode(bytes.subarray(offset + 30, offset + 30 + localNameLength)) === name, `Local name of ${name} disagrees`);
    const start = offset + 30 + localNameLength + localExtra;
    check(start + size <= centralOffset, `Entry ${name} overruns the central directory`);
    const data = bytes.subarray(start, start + size);
    check(crc32(data) === crc, `CRC mismatch in ${name}`);
    entries.push({ name, data, crc32: crc, offset, version, flags, method, time, date });
    at += 46 + nameLength + extraLength + commentLength;
  }
  check(at === end, 'Central directory size mismatch');
  return entries;
}
