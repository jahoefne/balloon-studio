// Ported from mac/Sources/BalloonStudio/ThreeMF.swift @ cbda68d (lines 59-63: StoredZIP.table,
// and the CRC loop of StoredZIP.archive, :70-72). CRC-32 (IEEE 802.3, reflected 0xEDB88320).

/** Swift `StoredZIP.table`. */
export const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let n = i;
    for (let k = 0; k < 8; k++) n = (n & 1) === 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1;
    table[i] = n >>> 0;
  }
  return table;
})();

/** CRC-32 of `bytes` as StoredZIP computes it (start `UInt32.max`, final xor `UInt32.max`). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC32_TABLE[(crc ^ (bytes[i] as number)) & 255] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
