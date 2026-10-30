// Loads reference bodies: Tier A from references/files (committed), Tier B from the unpacked pack.
// A missing body is `null`, never an error: the caller reports `unverified-needs-pack`. A body
// that does not hash to its manifest value is corrupt and throws, so that a damaged pack cannot
// look like a port bug.
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { REFERENCES_DIR, loadManifest, type ExportedCase, type ManifestEntry, type ReferenceCase } from './manifest';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** `REFS_PACK_DIR` (read on every call), else `references/pack/<release>`. Worktrees can share one unpacked pack this way. */
export function packDir(): string {
  const override = process.env['REFS_PACK_DIR'];
  if (override !== undefined && override !== '') return override.endsWith('/') ? override : `${override}/`;
  return `${REFERENCES_DIR}pack/${loadManifest().pack.release}/`;
}

export function hasPack(): boolean {
  return existsSync(`${packDir()}files`);
}

function verified(bytes: Uint8Array, sha256: string, what: string): Uint8Array {
  const actual = sha256Hex(bytes);
  if (actual !== sha256) throw new Error(`Corrupt reference ${what}: SHA-256 ${actual}, manifest says ${sha256}`);
  return bytes;
}

function readTierA(sha256: string): Uint8Array | null {
  const path = `${REFERENCES_DIR}files/${sha256.slice(0, 2)}/${sha256}`;
  return existsSync(path) ? readFileSync(path) : null;
}

function archivePath(c: ExportedCase): string {
  return `${packDir()}files/${c.id}/${c.filename}`;
}

/** The whole output of a case, or null when it is neither in Tier A nor in the pack. */
export function loadCaseBody(c: ExportedCase): Uint8Array | null {
  const tierA = c.tierA ? readTierA(c.sha256) : null;
  if (tierA !== null) return verified(tierA, c.sha256, c.id);
  const path = archivePath(c);
  return existsSync(path) ? verified(readFileSync(path), c.sha256, path) : null;
}

/** One ZIP/3MF entry: from Tier A, else cut out of the archive in the pack (`localHeaderOffset`). */
export function loadEntryBody(c: ExportedCase, entry: ManifestEntry): Uint8Array | null {
  const what = `${c.id}/${entry.name}`;
  const tierA = entry.tierA ? readTierA(entry.sha256) : null;
  if (tierA !== null) return verified(tierA, entry.sha256, what);
  const path = archivePath(c);
  if (!existsSync(path)) return null;
  const file = openSync(path, 'r');
  try {
    const header = new Uint8Array(30);
    readSync(file, header, 0, 30, entry.localHeaderOffset);
    const view = new DataView(header.buffer);
    if (view.getUint32(0, true) !== 0x04034b50) throw new Error(`Corrupt reference ${what}: no local header at ${entry.localHeaderOffset}`);
    const start = entry.localHeaderOffset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
    const body = new Uint8Array(entry.bytes);
    readSync(file, body, 0, entry.bytes, start);
    return verified(body, entry.sha256, what);
  } finally {
    closeSync(file);
  }
}

/** True when a difference in this case could be fully diagnosed right now. */
export function referenceAvailable(c: ReferenceCase): boolean {
  if (c.error !== undefined) return true;
  return c.tierA || existsSync(archivePath(c));
}
