// Replaces CryptoKit `SHA256.hash(data:)` used by mac/Sources/BalloonStudio/STLImport.swift @ cbda68d
// (BSTL0002 header). Synchronous pure-JS implementation (@noble/hashes, MIT), usable in the worker.
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';

/** SHA-256 digest (32 bytes) of the concatenation of `parts`. */
export function sha256(...parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return nobleSha256(parts[0] as Uint8Array);
  const hash = nobleSha256.create();
  for (const part of parts) hash.update(part);
  return hash.digest();
}
