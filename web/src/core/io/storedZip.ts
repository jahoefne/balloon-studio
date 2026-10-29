// Ported from mac/Sources/BalloonStudio/ThreeMF.swift @ cbda68d (lines 57-85: StoredZIP.archive).
//
// Small standards-compliant ZIP writer. Stored entries keep export dependency-free.
// Byte for byte as Swift: local header (version 20, flags 0, method 0, time 0, date 33),
// CRC-32, sizes, UTF-8 name, no extra fields; central directory in entry order; EOCD.
import { utf8 } from '../swift/text';
import { crc32 } from './crc32';

export type ZipEntry = readonly [path: string, bytes: Uint8Array];

function checkU16(value: number, what: string): number {
  // Swift UInt16(v) traps above 65535.
  if (value > 0xffff) throw new RangeError(`StoredZIP: ${what} ${value} does not fit UInt16`);
  return value;
}

function checkU32(value: number, what: string): number {
  if (value > 0xffffffff) throw new RangeError(`StoredZIP: ${what} ${value} does not fit UInt32`);
  return value;
}

/** Swift `StoredZIP.archive(entries)`. */
export function storedZipArchive(entries: readonly ZipEntry[]): Uint8Array {
  const names = entries.map(([path]) => utf8(path));
  let localSize = 0;
  let centralSize = 0;
  entries.forEach(([, bytes], i) => {
    const name = names[i] as Uint8Array;
    localSize += 30 + name.length + bytes.length;
    centralSize += 46 + name.length;
  });
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const u16 = (at: number, v: number): void => view.setUint16(at, v, true);
  const u32 = (at: number, v: number): void => view.setUint32(at, v, true);
  let offset = 0;
  let central = localSize;
  entries.forEach(([, bytes], i) => {
    const name = names[i] as Uint8Array;
    const size = checkU32(bytes.length, 'entry size');
    const nameLength = checkU16(name.length, 'name length');
    const crc = crc32(bytes);
    const local = checkU32(offset, 'offset');
    u32(offset, 0x04034b50);
    u16(offset + 4, 20);
    u16(offset + 6, 0);
    u16(offset + 8, 0);
    u16(offset + 10, 0);
    u16(offset + 12, 33);
    u32(offset + 14, crc);
    u32(offset + 18, size);
    u32(offset + 22, size);
    u16(offset + 26, nameLength);
    u16(offset + 28, 0);
    out.set(name, offset + 30);
    out.set(bytes, offset + 30 + name.length);
    offset += 30 + name.length + bytes.length;
    u32(central, 0x02014b50);
    u16(central + 4, 20);
    u16(central + 6, 20);
    u16(central + 8, 0);
    u16(central + 10, 0);
    u16(central + 12, 0);
    u16(central + 14, 33);
    u32(central + 16, crc);
    u32(central + 20, size);
    u32(central + 24, size);
    u16(central + 28, nameLength);
    u16(central + 30, 0);
    u16(central + 32, 0);
    u16(central + 34, 0);
    u16(central + 36, 0);
    u32(central + 38, 0);
    u32(central + 42, local);
    out.set(name, central + 46);
    central += 46 + name.length;
  });
  const end = localSize + centralSize;
  u32(end, 0x06054b50);
  u16(end + 4, 0);
  u16(end + 6, 0);
  u16(end + 8, checkU16(entries.length, 'entry count'));
  u16(end + 10, entries.length);
  u32(end + 12, checkU32(centralSize, 'central directory size'));
  u32(end + 16, checkU32(localSize, 'central directory offset'));
  u16(end + 20, 0);
  return out;
}
